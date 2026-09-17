import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowLeft, Check, X } from "lucide-react";

import PlanPicker from "../../components/PlanPicker";
import SubscriptionPayment from "../../components/SubscriptionPayment";
import {
  fetchPlans,
  firstChargePrice,
  formatMoney,
  type BillingInterval,
  type Plan,
} from "../../lib/plans";
import {
  cancelSubscription,
  changePlan,
  fetchOwnerSubscription,
  formatLongDate,
  nextChargeDate,
  renewalPrice,
  resumeSubscription,
  selectPlan,
  stillPublished,
  type OwnerSubscription,
} from "../../lib/subscription";

const STATUS_LABEL = {
  activa: "Activa",
  pendiente: "Pendiente de pago",
  vencida: "Pago rechazado",
  cancelada: "Cancelada",
} as const;

function Modal({
  title,
  onClose,
  wide = false,
  children,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div
        className={`bg-white rounded-3xl p-6 w-full max-h-[90vh] overflow-y-auto ${
          wide ? "max-w-2xl" : "max-w-md"
        }`}
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <p className="font-semibold text-slate-800 text-lg">{title}</p>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-slate-600 transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function OwnerEstudioSuscripcion() {
  const navigate = useNavigate();
  const [sub, setSub] = useState<OwnerSubscription | null>(null);
  const [loadError, setLoadError] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);

  // Ventanas: cancelar, elegir plan y confirmar el plan elegido.
  const [cancelOpen, setCancelOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Elegir suscripcion despues de que la anterior termino.
  const [chooseStep, setChooseStep] = useState<"pick" | "confirm" | "pay" | null>(
    null,
  );
  const [chooseInterval, setChooseInterval] = useState<BillingInterval>("month");
  const [choosePlanId, setChoosePlanId] = useState<number | null>(null);
  const [activating, setActivating] = useState(false);

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const load = () =>
    fetchOwnerSubscription()
      .then((data) => {
        setSub(data);
        setLoadError("");
      })
      .catch(() => setLoadError("No pudimos cargar tu suscripción."));

  useEffect(() => {
    load();
  }, []);

  // Corre una accion contra el backend y, si sale bien, relee el estado y
  // cierra las ventanas. Si falla, el error se queda visible en la ventana.
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setActionError("");
    try {
      await action();
      await load();
      setCancelOpen(false);
      setPickerOpen(false);
      setConfirmOpen(false);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Algo salió mal. Intenta de nuevo.",
      );
    } finally {
      setBusy(false);
    }
  };

  const loadPlans = () => {
    if (plans.length === 0) fetchPlans().then(setPlans).catch(() => {});
  };

  const openChooser = () => {
    if (!sub) return;
    setActionError("");
    setChooseInterval(sub.billing_interval ?? "month");
    setChoosePlanId(sub.plan_id ?? null);
    setChooseStep("pick");
    loadPlans();
  };

  const closeChooser = () => setChooseStep(null);

  // Guarda el plan elegido y pasa al formulario de pago, que arma el cobro
  // con lo que se acaba de guardar.
  const goToPayment = async () => {
    if (!choosePlanId) return;
    setBusy(true);
    setActionError("");
    try {
      await selectPlan(choosePlanId, chooseInterval);
      setChooseStep("pay");
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Algo salió mal. Intenta de nuevo.",
      );
    } finally {
      setBusy(false);
    }
  };

  // El webhook es quien activa la suscripcion y tarda un momento. Se relee
  // unas cuantas veces hasta verla activa.
  const waitForActivation = async () => {
    setChooseStep(null);
    setActivating(true);
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const fresh = await fetchOwnerSubscription().catch(() => null);
      if (fresh) setSub(fresh);
      if (fresh?.status === "activa") break;
    }
    setActivating(false);
  };

  const openPicker = () => {
    if (!sub) return;
    setActionError("");
    setSelectedPlanId(sub.pending_plan?.id ?? sub.plan_id ?? null);
    setPickerOpen(true);
    loadPlans();
  };

  const header = (
    <div className="flex items-center gap-3 mb-8">
      <ArrowLeft
        size={22}
        onClick={() => navigate(-1)}
        className="text-ink cursor-pointer"
      />
      <h1
        className="text-4xl md:text-6xl font-semibold text-slate-800"
        style={{ fontFamily: "Cormorant Garamond, serif" }}
      >
        Mi <span className="text-ink">Suscripción</span>
      </h1>
    </div>
  );

  if (!sub) {
    return (
      <div className="p-4 md:p-8">
        {header}
        {loadError && (
          <p className="max-w-2xl mx-auto text-sm text-slate-500">{loadError}</p>
        )}
      </div>
    );
  }

  if (sub.status === "demo") {
    return (
      <div className="p-4 md:p-8">
        {header}
        <div className="max-w-2xl mx-auto bg-white rounded-2xl p-6">
          <p className="font-medium text-slate-800 mb-1">Cuenta demo</p>
          <p className="text-md text-slate-600">
            Este estudio es de demostración: no tiene suscripción ni cobros, no
            aparece en el catálogo público y solo lo ven las cuentas demo.
          </p>
        </div>
      </div>
    );
  }

  if (sub.status === "heredada") {
    return (
      <div className="p-4 md:p-8">
        {header}
        <div className="max-w-2xl mx-auto bg-white rounded-2xl p-6">
          <p className="font-medium text-slate-800 mb-1">Sin plan contratado</p>
          <p className="text-md text-slate-600">
            Tu estudio se registró antes de que existieran los planes. Escríbenos
            si quieres contratar uno.
          </p>
        </div>
      </div>
    );
  }

  const interval = sub.billing_interval ?? "month";
  const perLabel = interval === "year" ? "año" : "mes";
  const cadence = interval === "year" ? "anual" : "mensual";
  const currency = (sub.currency ?? "mxn").toUpperCase();
  const periodEnd = sub.current_period_end
    ? formatLongDate(sub.current_period_end)
    : null;
  const endPhrase = periodEnd ? `el ${periodEnd}` : "al terminar tu periodo actual";
  const manageable = sub.status === "activa";
  const cancelling = manageable && sub.cancel_at_period_end;

  const currentPrice =
    sub.price_cents != null && sub.annual_price_cents != null
      ? renewalPrice(
          { price_cents: sub.price_cents, annual_price_cents: sub.annual_price_cents },
          interval,
        )
      : null;

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null;
  // Plan que quedaria vigente en la siguiente renovacion si no se toca nada.
  const upcomingPlanId = sub.pending_plan?.id ?? sub.plan_id;
  const revertingChange =
    selectedPlanId === sub.plan_id && Boolean(sub.pending_plan);

  // Lo que se cobra al elegir suscripcion de nuevo. La bienvenida solo aplica
  // a quien nunca ha pagado; es la misma regla que usa el backend al cobrar.
  const chosenPlan = plans.find((p) => p.id === choosePlanId) ?? null;
  const chosenCadence = chooseInterval === "year" ? "anual" : "mensual";
  const chosenToday = chosenPlan
    ? sub.has_paid_before
      ? renewalPrice(chosenPlan, chooseInterval)
      : firstChargePrice(chosenPlan, chooseInterval)
    : 0;
  const chosenRenewal = chosenPlan ? renewalPrice(chosenPlan, chooseInterval) : 0;
  const chosenCurrency = (chosenPlan?.currency ?? "mxn").toUpperCase();

  return (
    <div className="p-4 md:p-8">
      {header}

      <div className="max-w-2xl mx-auto flex flex-col gap-4">
        <div className="bg-white rounded-2xl p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs text-slate-400 mb-1">
                {sub.status === "cancelada" ? "Último plan" : "Plan actual"}
              </p>
              <p
                className="text-3xl font-semibold text-slate-800"
                style={{ fontFamily: "Cormorant Garamond, serif" }}
              >
                {sub.plan_name}
              </p>
              {currentPrice != null && (
                <p className="text-sm text-slate-500 mt-1">
                  ${formatMoney(currentPrice)} {currency} / {perLabel} · pago{" "}
                  {cadence}
                </p>
              )}
            </div>
            {manageable && !cancelling && (
              <button
                onClick={openPicker}
                className="px-5 py-2.5 rounded-full border border-line text-sm font-medium text-ink hover:bg-surface transition-colors cursor-pointer"
              >
                Cambiar plan
              </button>
            )}
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-line">
            <div>
              <dt className="text-xs text-slate-400">Estado</dt>
              <dd className="text-sm text-slate-800 mt-0.5">
                {cancelling ? "Cancelación programada" : STATUS_LABEL[sub.status]}
              </dd>
            </div>
            {sub.started_at && (
              <div>
                <dt className="text-xs text-slate-400">Suscrito desde</dt>
                <dd className="text-sm text-slate-800 mt-0.5">
                  {formatLongDate(sub.started_at)}
                </dd>
              </div>
            )}
            {manageable && periodEnd && (
              <div>
                <dt className="text-xs text-slate-400">
                  {cancelling ? "Último día de uso" : "Próximo cobro"}
                </dt>
                <dd className="text-sm text-slate-800 mt-0.5">{periodEnd}</dd>
              </div>
            )}
          </dl>

          {manageable && !cancelling && sub.pending_plan && (
            <p className="text-sm text-ink bg-surface rounded-xl px-4 py-3 mt-6">
              Cambiarás al plan <strong>{sub.pending_plan.name}</strong> {endPhrase}.
              Desde ese día se cobrarán $
              {formatMoney(renewalPrice(sub.pending_plan, interval))} {currency} de
              forma {cadence}.
            </p>
          )}
        </div>

        {cancelling && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <AlertCircle size={20} className="text-amber-700 shrink-0" />
            <p className="flex-1 text-sm text-amber-800">
              Cancelaste tu suscripción. Ya no se te cobrará y tu estudio dejará
              de estar visible {endPhrase}.
            </p>
            <button
              onClick={() => run(resumeSubscription)}
              disabled={busy}
              className="px-5 py-2.5 rounded-full bg-ink text-white text-sm font-medium hover:bg-ink-soft transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
            >
              {busy ? "Reanudando..." : "Reanudar suscripción"}
            </button>
          </div>
        )}
        {cancelling && actionError && !cancelOpen && !pickerOpen && (
          <p className="text-sm text-red-500">{actionError}</p>
        )}

        {sub.status === "cancelada" && (
          <div className="bg-white rounded-2xl p-6 flex flex-col items-center gap-4 text-center">
            <p className="text-md text-slate-600">
              Tu suscripción terminó y tu estudio ya no aparece en el catálogo.
              Elige una suscripción para volver a publicarlo.
            </p>
            <button
              onClick={openChooser}
              className="px-6 py-2.5 rounded-full bg-ink text-white text-sm font-medium hover:bg-ink-soft transition-colors cursor-pointer"
            >
              Elegir suscripción
            </button>
          </div>
        )}

        {(sub.status === "pendiente" || sub.status === "vencida") && (
          <p className="text-sm text-slate-500 px-1">
            {stillPublished(sub) && sub.paid_until
              ? `Tu estudio seguirá visible hasta el ${formatLongDate(sub.paid_until)}. Resuelve el pago desde el aviso de arriba para que no desaparezca del catálogo.`
              : "Tu estudio no aparece en el catálogo. Resuelve el pago desde el aviso de arriba para publicarlo."}
          </p>
        )}

        {manageable && !cancelling && (
          <button
            onClick={() => {
              setActionError("");
              setCancelOpen(true);
            }}
            className="self-start text-sm text-red-500 hover:text-red-600 px-1 cursor-pointer"
          >
            Cancelar suscripción
          </button>
        )}
      </div>

      {chooseStep === "pick" && (
        <Modal title="Elegir suscripción" onClose={closeChooser} wide>
          <PlanPicker
            plans={plans}
            selectedId={choosePlanId}
            onSelect={setChoosePlanId}
            interval={chooseInterval}
            onIntervalChange={setChooseInterval}
            introEligible={!sub.has_paid_before}
          />
          <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6">
            <button
              onClick={closeChooser}
              className="flex-1 px-5 py-2.5 rounded-full border border-line text-sm font-medium text-slate-700 hover:bg-surface transition-colors cursor-pointer"
            >
              Cerrar
            </button>
            <button
              onClick={() => {
                setActionError("");
                setChooseStep("confirm");
              }}
              disabled={!chosenPlan}
              className="flex-1 px-5 py-2.5 rounded-full bg-ink text-white text-sm font-medium hover:bg-ink-soft transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Escoger suscripción
            </button>
          </div>
        </Modal>
      )}

      {chooseStep === "confirm" && chosenPlan && (
        <Modal title="Confirmar suscripción" onClose={closeChooser}>
          <div className="rounded-2xl bg-surface p-5">
            <p className="text-xs text-slate-400">Plan</p>
            <p
              className="text-2xl font-semibold text-slate-800"
              style={{ fontFamily: "Cormorant Garamond, serif" }}
            >
              {chosenPlan.name}
            </p>
            <p className="text-sm text-slate-500">Pago {chosenCadence}</p>
            <dl className="mt-4 pt-4 border-t border-line flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Pagas hoy</dt>
                <dd className="font-semibold text-slate-800">
                  ${formatMoney(chosenToday)} {chosenCurrency}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Siguiente cobro</dt>
                <dd className="text-slate-800 text-right">
                  {formatLongDate(nextChargeDate(chooseInterval))}
                  <br />
                  <span className="text-slate-500">
                    ${formatMoney(chosenRenewal)} {chosenCurrency}
                  </span>
                </dd>
              </div>
            </dl>
          </div>
          <p className="text-xs text-slate-400 mt-4">
            Tu estudio vuelve a aparecer en el catálogo en cuanto se confirme el
            pago. La suscripción se renueva de forma {chosenCadence} hasta que la
            canceles.
          </p>
          {actionError && <p className="text-sm text-red-500 mt-4">{actionError}</p>}
          <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6">
            <button
              onClick={() => setChooseStep("pick")}
              className="flex-1 px-5 py-2.5 rounded-full border border-line text-sm font-medium text-slate-700 hover:bg-surface transition-colors cursor-pointer"
            >
              Volver
            </button>
            <button
              onClick={goToPayment}
              disabled={busy}
              className="flex-1 px-5 py-2.5 rounded-full bg-ink text-white text-sm font-medium hover:bg-ink-soft transition-colors cursor-pointer disabled:opacity-60"
            >
              {busy ? "Preparando..." : "Confirmar e ir al pago"}
            </button>
          </div>
        </Modal>
      )}

      {chooseStep === "pay" && chosenPlan && (
        <Modal title="Datos de pago" onClose={closeChooser}>
          <p className="text-xs text-slate-400 -mt-3 mb-5">
            Plan {chosenPlan.name} · {chosenCadence}
          </p>
          <SubscriptionPayment cta="Pagar y activar" onSuccess={waitForActivation} />
        </Modal>
      )}

      {activating && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1000] rounded-full bg-ink text-white text-sm px-5 py-3 shadow-lg">
          Confirmando tu pago...
        </div>
      )}

      {cancelOpen && (
        <Modal title="¿Cancelar tu suscripción?" onClose={() => setCancelOpen(false)}>
          <div className="flex flex-col gap-3 text-sm text-slate-600 leading-relaxed">
            <p>
              Si cancelas tu suscripción, dejaremos de cobrarte y tu estudio
              dejará de estar visible en el catálogo de estudios. Los usuarios ya
              no podrán reservar tus clases.
            </p>
            <p className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-amber-900">
              {periodEnd ? (
                <>
                  Tu último día de uso es el <strong>{periodEnd}</strong>.
                </>
              ) : (
                "Podrás usar Wellco hasta que termine el periodo que ya pagaste."
              )}
            </p>
          </div>
          {actionError && <p className="text-sm text-red-500 mt-4">{actionError}</p>}
          <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6">
            <button
              onClick={() => setCancelOpen(false)}
              className="flex-1 px-5 py-2.5 rounded-full border border-line text-sm font-medium text-slate-700 hover:bg-surface transition-colors cursor-pointer"
            >
              Mantener suscripción
            </button>
            <button
              onClick={() => run(cancelSubscription)}
              disabled={busy}
              className="flex-1 px-5 py-2.5 rounded-full bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors cursor-pointer disabled:opacity-60"
            >
              {busy ? "Cancelando..." : "Sí, cancelar"}
            </button>
          </div>
        </Modal>
      )}

      {pickerOpen && !confirmOpen && (
        <Modal title="Cambiar plan" onClose={() => setPickerOpen(false)} wide>
          {plans.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-line bg-surface h-64 animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {plans.map((plan) => {
                const selected = plan.id === selectedPlanId;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlanId(plan.id)}
                    aria-pressed={selected}
                    className={`text-left rounded-2xl p-5 border-2 transition-colors cursor-pointer flex flex-col ${
                      selected
                        ? "border-ink bg-surface"
                        : "border-line hover:border-slate-400"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p
                        className="text-xl font-semibold text-slate-800"
                        style={{ fontFamily: "Cormorant Garamond, serif" }}
                      >
                        {plan.name}
                      </p>
                      <span
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          selected ? "border-ink" : "border-slate-300"
                        }`}
                      >
                        {selected && <span className="w-2 h-2 rounded-full bg-ink" />}
                      </span>
                    </div>
                    {plan.id === sub.plan_id && (
                      <span className="self-start text-[10px] tracking-wide uppercase text-ink bg-ink/5 rounded-full px-2 py-0.5 mb-2">
                        Plan actual
                      </span>
                    )}
                    {plan.tagline && (
                      <p className="text-xs text-slate-400 mb-3">{plan.tagline}</p>
                    )}
                    <p className="text-sm text-slate-800 mb-3">
                      <span
                        className="text-2xl font-semibold"
                        style={{ fontFamily: "Cormorant Garamond, serif" }}
                      >
                        ${formatMoney(renewalPrice(plan, interval))}
                      </span>{" "}
                      <span className="text-xs text-slate-400">
                        {plan.currency.toUpperCase()} / {perLabel}
                      </span>
                    </p>
                    <ul className="flex flex-col gap-2">
                      {plan.features.map((f) => (
                        <li key={f.id} className="flex gap-2 items-start">
                          <Check size={13} className="text-ink mt-0.5 shrink-0" />
                          <span className="text-xs text-slate-600 leading-relaxed">
                            {f.label}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-xs text-slate-400 mt-4">
            El cambio se aplica al terminar tu periodo actual. Hasta entonces
            conservas tu plan {sub.plan_name}.
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6">
            <button
              onClick={() => setPickerOpen(false)}
              className="flex-1 px-5 py-2.5 rounded-full border border-line text-sm font-medium text-slate-700 hover:bg-surface transition-colors cursor-pointer"
            >
              Cerrar
            </button>
            <button
              onClick={() => {
                setActionError("");
                setConfirmOpen(true);
              }}
              disabled={!selectedPlan || selectedPlanId === upcomingPlanId}
              className="flex-1 px-5 py-2.5 rounded-full bg-ink text-white text-sm font-medium hover:bg-ink-soft transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Cambiar plan
            </button>
          </div>
        </Modal>
      )}

      {confirmOpen && selectedPlan && (
        <Modal title="Confirmar cambio de plan" onClose={() => setConfirmOpen(false)}>
          <div className="text-sm text-slate-600 leading-relaxed">
            {revertingChange ? (
              <p>
                Conservarás tu plan <strong>{sub.plan_name}</strong> y se cancela
                el cambio al plan {sub.pending_plan?.name}. Se seguirán cobrando $
                {formatMoney(renewalPrice(selectedPlan, interval))} {currency} de
                forma {cadence}.
              </p>
            ) : (
              <p>
                Tu cambio al plan <strong>{selectedPlan.name}</strong> será{" "}
                <strong>{endPhrase}</strong> y se cobrarán{" "}
                <strong>
                  ${formatMoney(renewalPrice(selectedPlan, interval))} {currency}
                </strong>{" "}
                de forma {cadence}. Hasta ese día conservas tu plan{" "}
                {sub.plan_name} sin costo adicional.
              </p>
            )}
          </div>
          {actionError && <p className="text-sm text-red-500 mt-4">{actionError}</p>}
          <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6">
            <button
              onClick={() => setConfirmOpen(false)}
              className="flex-1 px-5 py-2.5 rounded-full border border-line text-sm font-medium text-slate-700 hover:bg-surface transition-colors cursor-pointer"
            >
              Volver
            </button>
            <button
              onClick={() => run(() => changePlan(selectedPlan.id))}
              disabled={busy}
              className="flex-1 px-5 py-2.5 rounded-full bg-ink text-white text-sm font-medium hover:bg-ink-soft transition-colors cursor-pointer disabled:opacity-60"
            >
              {busy ? "Guardando..." : "Confirmar"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default OwnerEstudioSuscripcion;
