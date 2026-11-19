import { useCallback, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

import { apiJson } from "../../lib/api";
import { money } from "../../lib/packages";

/* Fondos de Wellco en Stripe (GET /admin/fondos, services/platformFunds.js).

   Lo mismo que "Tu dinero" del dueño, pero de la cuenta de la plataforma: en
   proceso, disponible y en camino, mas el siguiente deposito automatico y el
   saldo minimo que Stripe deja para reembolsos. Abajo, los depositos de
   Stripe al banco de los ultimos 90 dias. Los cobros no van aqui: estan en
   Pagos y Clases pagadas. Todo se lee de Stripe en cada peticion. */

type Payout = {
  id: string;
  amount_cents: number;
  status: "paid" | "pending" | "in_transit" | "canceled" | "failed";
  created: number;
  arrival_date: number;
  automatic: boolean;
  /** "BBVA ···1234" */
  destination: string | null;
  failure_message: string | null;
};

type Funds = {
  pending_cents: number;
  available_cents: number;
  in_transit_cents: number;
  minimum_balance_cents: number | null;
  schedule: {
    interval: "daily" | "weekly" | "monthly" | "manual" | null;
    weekly_payout_days: string[];
    monthly_payout_days: number[];
  } | null;
  delay_days: number | null;
  payouts_enabled: boolean;
  next_payout: { date: string; amount_cents: number } | null;
  payouts: Payout[];
  paid_total_cents: number;
  history_truncated: boolean;
  history_days: number;
};

const REFRESH_MS = 60_000;
const PAGE = 20;
const STRIPE_PAYOUTS_URL = "https://dashboard.stripe.com/payouts";

const PAYOUT_STATUS: Record<Payout["status"], { label: string; className: string }> = {
  paid: { label: "Depositado", className: "bg-ink/5 text-ink" },
  in_transit: { label: "En camino", className: "bg-amber-50 text-amber-700" },
  pending: { label: "Programado", className: "bg-amber-50 text-amber-700" },
  failed: { label: "Falló", className: "bg-red-50 text-red-600" },
  canceled: { label: "Cancelado", className: "bg-slate-100 text-slate-500" },
};

const WEEKDAYS: Record<string, string> = {
  monday: "lunes",
  tuesday: "martes",
  wednesday: "miércoles",
  thursday: "jueves",
  friday: "viernes",
  saturday: "sábado",
  sunday: "domingo",
};

function listEs(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

function scheduleText(s: Funds["schedule"]) {
  switch (s?.interval) {
    case "daily":
      return "Stripe deposita todos los días hábiles.";
    case "weekly":
      return `Stripe deposita cada ${listEs(
        s.weekly_payout_days.map((d) => WEEKDAYS[d] ?? d),
      )}.`;
    case "monthly":
      return `Stripe deposita el día ${listEs(
        s.monthly_payout_days.map(String),
      )} de cada mes.`;
    case "manual":
      return "Los depósitos son manuales: se hacen desde el panel de Stripe.";
    default:
      return null;
  }
}

function fromSeconds(seconds: number) {
  return new Date(seconds * 1000).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Mexico_City",
  });
}

/** "2026-11-20" -> "viernes 20 de noviembre", sin que la zona le reste un dia. */
function payoutDay(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** Con signo: un saldo puede quedar negativo tras un reembolso. */
function signed(cents: number) {
  return `${cents < 0 ? "−" : ""}$${money(Math.abs(cents))}`;
}

function AdminFondos() {
  const [data, setData] = useState<Funds | null>(null);
  const [error, setError] = useState("");
  const [shown, setShown] = useState(PAGE);

  const load = useCallback(() => {
    apiJson<Funds>("/admin/fondos")
      .then((f) => {
        setData(f);
        setError("");
      })
      .catch(() => setError("No pudimos leer el saldo de Stripe."));
  }, []);

  useEffect(() => {
    load();
    const refresh = () => {
      if (document.visibilityState === "visible") load();
    };
    const timer = setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const header = (
    <div className="mb-8">
      <h1
        className="text-4xl md:text-6xl font-semibold text-slate-800"
        style={{ fontFamily: "Cormorant Garamond, serif" }}
      >
        Fondos{" "}
        <span
          className="text-[#1b2c44]"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Stripe
        </span>
      </h1>
      <p className="text-slate-600 mt-2">
        El dinero de Wellco en Stripe y lo que te ha depositado a tu banco.
      </p>
    </div>
  );

  if (!data) {
    return (
      <div className="p-4 md:p-8">
        {header}
        <p className="text-sm text-slate-500">
          {error || "Cargando saldo..."}
        </p>
      </div>
    );
  }

  const tiles = [
    {
      label: "En proceso",
      cents: data.pending_cents,
      hint:
        data.delay_days != null
          ? `Cobrado; Stripe lo libera en ${data.delay_days} días`
          : "Cobrado, Stripe aún no lo libera",
    },
    {
      label: "Disponible",
      cents: data.available_cents,
      hint: "Liberado, sale en el próximo depósito",
    },
    {
      label: "En camino a tu banco",
      cents: data.in_transit_cents,
      hint: "Depósito ya enviado",
    },
  ];

  const minimum = data.minimum_balance_cents;
  const next = data.next_payout;
  const payouts = data.payouts.slice(0, shown);

  return (
    <div className="p-4 md:p-8">
      {header}

      <div className="bg-white rounded-2xl p-6 max-w-4xl">
        <div className="flex items-center justify-between gap-3 mb-4">
          <p className="font-medium text-slate-800">Saldo de Wellco</p>
          <a
            href={STRIPE_PAYOUTS_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-sm text-ink hover:text-ink-soft"
          >
            Ver en Stripe
            <ExternalLink size={14} />
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {tiles.map((t) => (
            <div key={t.label} className="bg-surface rounded-xl p-4">
              <p className="text-xs text-slate-500">{t.label}</p>
              <p className="text-2xl font-semibold text-ink mt-1">
                {signed(t.cents)}
              </p>
              <p className="text-xs text-slate-400 mt-1">{t.hint}</p>
            </div>
          ))}
        </div>

        {/* Siguiente deposito automatico */}
        <div className="border border-line rounded-xl p-4 mt-3">
          <p className="text-xs text-slate-500">Próximo depósito automático</p>
          {!data.payouts_enabled ? (
            <p className="text-sm text-amber-700 mt-1">
              Stripe tiene los depósitos desactivados en esta cuenta. Revisa la
              cuenta bancaria en Configuración &gt; Depósitos de Stripe.
            </p>
          ) : next ? (
            <>
              <p className="text-2xl font-semibold text-ink mt-1">
                ${money(next.amount_cents)}
                <span className="text-sm font-normal text-slate-500">
                  {" "}
                  · {payoutDay(next.date)}
                </span>
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Estimado: lo disponible ese día
                {minimum ? ` menos el mínimo de $${money(minimum)}` : ""}.
                Cambia si entran cobros o reembolsos antes.
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500 mt-1">
              Sin depósito automático programado.
            </p>
          )}
        </div>

        <div className="text-xs text-slate-500 mt-3 flex flex-col gap-1">
          {scheduleText(data.schedule) && <p>{scheduleText(data.schedule)}</p>}
          {minimum ? (
            <p>
              Stripe siempre deja <strong>${money(minimum)}</strong> en la
              cuenta para cubrir reembolsos y contracargos; solo deposita lo
              que pase de ahí.
            </p>
          ) : (
            <p className="text-amber-700">
              Stripe no tiene un saldo mínimo configurado: deposita todo lo
              disponible. Se pone en Configuración &gt; Depósitos de Stripe.
            </p>
          )}
        </div>

        {/* Historial de depositos al banco */}
        <div className="border-t border-line mt-6 pt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <p className="text-sm font-medium text-slate-800">
              Depósitos a tu banco · últimos 3 meses
            </p>
            {data.paid_total_cents > 0 && (
              <p className="text-xs text-slate-500">
                Depositado:{" "}
                <strong className="text-ink">
                  ${money(data.paid_total_cents)}
                </strong>
              </p>
            )}
          </div>

          {data.payouts.length === 0 ? (
            <p className="text-sm text-slate-500">
              Sin depósitos en los últimos {data.history_days} días.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto -mx-6 px-6">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 border-b border-line">
                      <th className="py-2 pr-3 font-medium">Enviado</th>
                      <th className="py-2 pr-3 font-medium">Llega</th>
                      <th className="py-2 pr-3 font-medium">Cuenta</th>
                      <th className="py-2 pr-3 font-medium text-right">Monto</th>
                      <th className="py-2 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {payouts.map((p) => {
                      const s = PAYOUT_STATUS[p.status] ?? PAYOUT_STATUS.pending;
                      return (
                        <tr key={p.id} className="align-top">
                          <td className="py-2.5 pr-3 text-slate-500 whitespace-nowrap">
                            {fromSeconds(p.created)}
                            {!p.automatic && (
                              <p className="text-xs text-slate-400">Manual</p>
                            )}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-500 whitespace-nowrap">
                            {fromSeconds(p.arrival_date)}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-600">
                            {p.destination ?? "—"}
                          </td>
                          <td className="py-2.5 pr-3 text-right whitespace-nowrap text-slate-800 font-medium">
                            ${money(p.amount_cents)}
                          </td>
                          <td className="py-2.5">
                            <span
                              className={`text-xs px-2.5 py-1 rounded-full whitespace-nowrap ${s.className}`}
                            >
                              {s.label}
                            </span>
                            {p.failure_message && (
                              <p className="text-xs text-red-500 mt-1">
                                {p.failure_message}
                              </p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {shown < data.payouts.length && (
                <button
                  onClick={() => setShown((n) => n + PAGE)}
                  className="mt-4 w-full border border-line text-slate-600 py-2.5 rounded-xl text-sm hover:bg-surface transition-colors cursor-pointer"
                >
                  Ver más ({data.payouts.length - shown} restantes)
                </button>
              )}
              {data.history_truncated && (
                <p className="text-xs text-slate-400 mt-3">
                  Hay más depósitos de los que caben aquí; el resto está en el
                  panel de Stripe.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminFondos;
