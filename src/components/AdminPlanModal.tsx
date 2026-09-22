// Cambiar el plan de un estudio desde el admin.
//
// No es una pantalla de autoservicio: la usa soporte cuando un estudio necesita
// ayuda. Por eso enseña todo antes de tocar nada (plan actual, lo que va a
// pagar, a quien le pega) y pide una confirmacion aparte del formulario.
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Check, Lock, X } from "lucide-react";

import { ApiError, apiJson } from "../lib/api";
import { formatMoney, toPesos } from "../lib/plans";
import type { BranchImpact } from "../lib/subscription";

interface AdminPlan {
  id: number;
  name: string;
  price_cents: number;
  annual_price_cents: number;
  max_studios: number;
  notices: boolean;
  features: string[];
}

interface PlanScreen {
  studio: { id: number; name: string; is_demo: boolean };
  owner: { name: string; email: string };
  subscription: {
    status: string;
    plan_id: number;
    plan_name: string;
    price_cents: number;
    billing_interval: "month" | "year";
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    pending_plan_id: number | null;
    pending_plan_name: string | null;
  } | null;
  /** Por que no se puede cambiar, en palabras. null = si se puede. */
  blocked: string | null;
  plans: AdminPlan[];
  impact: { max_studios: number; branches: BranchImpact[] } | null;
}

type When = "now" | "period_end";

function longDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Lo que incluye el plan: sus columnas primero, luego sus caracteristicas. */
function planLines(plan: AdminPlan) {
  return [
    plan.max_studios === 1
      ? "1 sucursal"
      : `Hasta ${plan.max_studios} sucursales`,
    ...(plan.notices ? ["Avisos a tus alumnos"] : []),
    ...plan.features,
  ];
}

interface Props {
  studioId: number;
  onClose: () => void;
  /** Para que la tabla vuelva a pedir los estudios con el plan ya cambiado. */
  onChanged: () => void;
}

function AdminPlanModal({ studioId, onClose, onChanged }: Props) {
  const [data, setData] = useState<PlanScreen | null>(null);
  const [error, setError] = useState("");

  const [planId, setPlanId] = useState<number | null>(null);
  const [when, setWhen] = useState<When>("period_end");
  const [note, setNote] = useState("");

  // La confirmacion es un paso aparte: el formulario no cambia nada hasta que
  // el admin ve el resumen y lo acepta.
  const [confirming, setConfirming] = useState(false);
  const [acceptBranches, setAcceptBranches] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{
    next_charge: string | null;
    emailed: string | null;
  } | null>(null);

  const load = useCallback(
    (forPlan?: number | null) => {
      const query = forPlan ? `?plan_id=${forPlan}` : "";
      return apiJson<PlanScreen>(`/admin/studios/${studioId}/plan${query}`)
        .then(setData)
        .catch((err) =>
          setError(
            err instanceof ApiError ? err.message : "No pudimos cargar el plan",
          ),
        );
    },
    [studioId],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Al elegir otro plan se vuelve a preguntar a quien le pega: las sucursales
  // que se dormirian y cuanta gente cuelga de ellas las cuenta el backend.
  const choosePlan = (id: number) => {
    setPlanId(id);
    setConfirming(false);
    setAcceptBranches(false);
    setError("");
    load(id);
  };

  const sub = data?.subscription ?? null;
  const target = data?.plans.find((p) => p.id === planId) ?? null;
  const sleeping = data?.impact?.branches ?? [];
  const annual = sub?.billing_interval === "year";
  const amount = target
    ? annual
      ? target.annual_price_cents
      : target.price_cents
    : 0;
  const periodEnd = sub?.current_period_end
    ? longDate(sub.current_period_end)
    : null;

  const submit = async () => {
    if (!target) return;
    setSaving(true);
    setError("");
    try {
      const res = await apiJson<{
        next_charge: string | null;
        emailed: string | null;
      }>(`/admin/studios/${studioId}/plan`, {
        method: "POST",
        body: JSON.stringify({
          plan_id: target.id,
          when,
          note: note.trim() || undefined,
          confirm_branches: sleeping.length > 0 ? acceptBranches : undefined,
        }),
      });
      setDone(res);
      onChanged();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "No pudimos cambiar el plan",
      );
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 p-6 pb-4">
          <div>
            <p className="font-semibold text-slate-800">Cambiar plan</p>
            {data && (
              <p className="text-xs text-slate-400 mt-0.5">
                {data.studio.name} · {data.owner.name}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="text-slate-300 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 pb-6">
          {!data && !error && (
            <p className="text-sm text-slate-400 py-6">Cargando…</p>
          )}

          {/* Ya se hizo: se le dice al admin que quedo y a quien se le aviso. */}
          {done && (
            <div className="py-4">
              <p className="flex items-center gap-2 font-medium text-slate-800 mb-2">
                <Check size={18} className="text-[#1b2c44]" />
                Plan cambiado
              </p>
              <p className="text-sm text-slate-500 leading-relaxed">
                {when === "now"
                  ? "El plan ya está activo. El ajuste por lo que no usó del anterior sale en su próximo recibo."
                  : `El cambio entra el ${done.next_charge ? longDate(done.next_charge) : "terminar su periodo"}. Hasta entonces sigue con el plan que tiene.`}
                {done.emailed && ` Le mandamos el detalle a ${done.emailed}.`}
              </p>
              <button
                onClick={onClose}
                className="mt-6 w-full bg-ink text-white py-2.5 rounded-xl font-medium hover:bg-ink-soft transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          )}

          {/* No se puede: cuenta demo, sin suscripción, cancelada... */}
          {data && !done && data.blocked && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 flex gap-3">
              <Lock size={18} className="text-amber-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-900">
                  No se puede cambiar
                </p>
                <p className="text-sm text-amber-800 mt-0.5">{data.blocked}</p>
              </div>
            </div>
          )}

          {data && !done && !data.blocked && sub && (
            <>
              <div className="rounded-2xl bg-surface border border-line p-4 mb-5 text-sm">
                <p className="text-slate-800">
                  Hoy paga <strong>{sub.plan_name}</strong> · $
                  {formatMoney(toPesos(sub.price_cents))} + IVA{" "}
                  {annual ? "al año" : "al mes"}
                </p>
                {periodEnd && (
                  <p className="text-slate-500 mt-1">
                    Próximo cobro: {periodEnd}
                  </p>
                )}
                {sub.pending_plan_name && (
                  <p className="text-amber-700 mt-1">
                    Ya tiene programado pasar a {sub.pending_plan_name} en su
                    renovación.
                  </p>
                )}
              </div>

              <p className="text-xs text-slate-400 mb-2">Plan nuevo</p>
              <div className="flex flex-col gap-2 mb-5">
                {data.plans.map((plan) => {
                  const actual = plan.id === sub.plan_id;
                  const elegido = plan.id === planId;
                  return (
                    <button
                      key={plan.id}
                      onClick={() => choosePlan(plan.id)}
                      className={`text-left rounded-2xl border p-4 transition-colors cursor-pointer ${
                        elegido
                          ? "border-[#1b2c44] bg-[#1b2c44]/5"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="font-medium text-slate-800">
                          {plan.name}
                          {actual && (
                            <span className="text-xs text-slate-400 font-normal">
                              {" "}
                              · el que tiene
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-slate-600">
                          $
                          {formatMoney(
                            toPesos(
                              annual
                                ? plan.annual_price_cents
                                : plan.price_cents,
                            ),
                          )}{" "}
                          + IVA {annual ? "al año" : "al mes"}
                        </p>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {planLines(plan).join(" · ")}
                      </p>
                    </button>
                  );
                })}
              </div>

              {target && (
                <>
                  <p className="text-xs text-slate-400 mb-2">
                    Cuándo se aplica
                  </p>
                  <div className="flex flex-col gap-2 mb-5">
                    <label
                      className={`flex gap-3 rounded-2xl border p-4 cursor-pointer transition-colors ${
                        when === "period_end"
                          ? "border-[#1b2c44] bg-[#1b2c44]/5"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="radio"
                        checked={when === "period_end"}
                        onChange={() => {
                          setWhen("period_end");
                          setConfirming(false);
                        }}
                        className="mt-1 accent-[#1b2c44]"
                      />
                      <span>
                        <span className="block text-sm font-medium text-slate-800">
                          Al terminar su periodo
                          {periodEnd ? ` (${periodEnd})` : ""}
                        </span>
                        <span className="block text-xs text-slate-500 mt-0.5">
                          Sigue con el plan que ya pagó y el precio nuevo entra
                          solo en su renovación. No hay cobros ni devoluciones.
                        </span>
                      </span>
                    </label>

                    <label
                      className={`flex gap-3 rounded-2xl border p-4 cursor-pointer transition-colors ${
                        when === "now"
                          ? "border-[#1b2c44] bg-[#1b2c44]/5"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="radio"
                        checked={when === "now"}
                        onChange={() => {
                          setWhen("now");
                          setConfirming(false);
                        }}
                        className="mt-1 accent-[#1b2c44]"
                      />
                      <span>
                        <span className="block text-sm font-medium text-slate-800">
                          Inmediato, con ajuste
                        </span>
                        <span className="block text-xs text-slate-500 mt-0.5">
                          El plan cambia ahora. En su próximo recibo se le
                          descuenta lo que no usó del anterior y se cobra solo
                          la parte que falta del nuevo. No se le cobra nada en
                          este momento.
                        </span>
                      </span>
                    </label>
                  </div>

                  {/* A quien le pega, contado por el backend. */}
                  {sleeping.length > 0 && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 mb-5">
                      <p className="flex items-center gap-2 font-medium text-amber-900 text-sm">
                        <AlertCircle size={16} className="shrink-0" />
                        {sleeping.length === 1
                          ? "Una sucursal deja de aparecer"
                          : `${sleeping.length} sucursales dejan de aparecer`}
                      </p>
                      <ul className="flex flex-col gap-1 mt-2">
                        {sleeping.map((b) => (
                          <li
                            key={b.id}
                            className="text-xs text-amber-800 bg-white/60 rounded-lg px-3 py-2"
                          >
                            <strong>{b.branch_name?.trim() || b.name}</strong>:{" "}
                            {b.bookings} reservación
                            {b.bookings === 1 ? "" : "es"} · {b.package_classes}{" "}
                            clase
                            {b.package_classes === 1 ? "" : "s"} de paquete sin
                            usar
                          </li>
                        ))}
                      </ul>
                      <label className="flex items-start gap-2 mt-3 text-xs text-amber-900 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={acceptBranches}
                          onChange={(e) => setAcceptBranches(e.target.checked)}
                          className="mt-0.5 accent-[#1b2c44]"
                        />
                        Entiendo que sus alumnos se mueven a la sucursal que
                        sobrevive y que las clases ya pagadas se les abonan ahí.
                      </label>
                    </div>
                  )}

                  <label className="text-xs text-slate-400 block mb-1.5">
                    Motivo (opcional, queda en la bitácora)
                  </label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value.slice(0, 500))}
                    rows={2}
                    placeholder="Apoyo por temporada baja, acuerdo comercial…"
                    className="w-full px-4 py-2.5 rounded-xl border border-line bg-surface text-sm outline-none focus:border-slate-400 transition-colors resize-none mb-5"
                  />

                  {/* Confirmacion: el resumen de lo que va a pasar, aparte. */}
                  {confirming ? (
                    <div className="rounded-2xl border border-line bg-surface p-4">
                      <p className="text-sm text-slate-800 font-medium mb-1">
                        ¿Confirmas el cambio?
                      </p>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        {data.studio.name} pasa de {sub.plan_name} a{" "}
                        <strong>{target.name}</strong> ($
                        {formatMoney(toPesos(amount))} + IVA{" "}
                        {annual ? "al año" : "al mes"}),{" "}
                        {when === "now"
                          ? "a partir de ahora"
                          : `el ${periodEnd ?? "terminar su periodo"}`}
                        . Le llega un correo a {data.owner.email} con el monto,
                        lo que incluye y la fecha de su próximo cobro.
                      </p>
                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={() => setConfirming(false)}
                          disabled={saving}
                          className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium hover:border-slate-400 transition-colors cursor-pointer"
                        >
                          Volver
                        </button>
                        <button
                          onClick={submit}
                          disabled={saving}
                          className="flex-1 bg-ink text-white py-2.5 rounded-xl text-sm font-medium hover:bg-ink-soft transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {saving ? "Cambiando…" : "Sí, cambiar el plan"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirming(true)}
                      disabled={sleeping.length > 0 && !acceptBranches}
                      className="w-full bg-ink text-white py-2.5 rounded-xl font-medium hover:bg-ink-soft transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Revisar el cambio
                    </button>
                  )}
                </>
              )}
            </>
          )}

          {error && <p className="text-sm text-red-500 mt-4">{error}</p>}
        </div>
      </div>
    </div>
  );
}

export default AdminPlanModal;
