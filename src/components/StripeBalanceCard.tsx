import { ExternalLink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { apiJson } from "../lib/api";
import { money } from "../lib/packages";

type Payout = {
  id: string;
  amount_cents: number;
  status: "paid" | "pending" | "in_transit" | "canceled" | "failed";
  /** Segundos Unix: cuando llega (o llego) al banco. */
  arrival_date: number;
};

type Schedule = {
  interval: "daily" | "weekly" | "monthly" | "manual";
  delay_days: number;
  weekly_anchor: string | null;
  monthly_anchor: number | null;
};

type Balance =
  | { connected: false }
  | {
      connected: true;
      pending_cents: number;
      available_cents: number;
      in_transit_cents: number;
      schedule: Schedule | null;
      payouts: Payout[];
    };

// Mismo ritmo que el panel de control: la pantalla se puede quedar abierta.
const REFRESH_MS = 60_000;

const STATUS: Record<Payout["status"], { label: string; className: string }> = {
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

function scheduleText(s: Schedule | null) {
  if (!s) return null;
  const release =
    s.delay_days > 0
      ? ` Cada cobro se libera ${s.delay_days} días después de hacerse.`
      : "";
  switch (s.interval) {
    case "daily":
      return `Stripe deposita a tu banco todos los días.${release}`;
    case "weekly":
      return `Stripe deposita a tu banco cada ${WEEKDAYS[s.weekly_anchor ?? ""] ?? "semana"}.${release}`;
    case "monthly":
      return `Stripe deposita a tu banco el día ${s.monthly_anchor} de cada mes.${release}`;
    default:
      return "Los depósitos son manuales: hazlos desde tu panel de Stripe.";
  }
}

function arrival(seconds: number) {
  return new Date(seconds * 1000).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Mexico_City",
  });
}

/** Resumen del dinero del estudio en Stripe: en proceso, disponible y depositado. */
export default function StripeBalanceCard() {
  const [data, setData] = useState<Balance | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    apiJson<Balance>("/payments/balance")
      .then((b) => {
        setData(b);
        setError("");
      })
      .catch(() => setError("No pudimos leer tu saldo de Stripe."));
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

  const [opening, setOpening] = useState(false);
  const [linkError, setLinkError] = useState("");
  const openDashboard = async () => {
    setOpening(true);
    setLinkError("");
    // La ventana se abre antes de esperar a la API: si se abre despues, el
    // navegador la toma por un pop up no pedido y la bloquea.
    const win = window.open("", "_blank");
    try {
      const { url } = await apiJson<{ url: string }>(
        "/payments/dashboard-link",
        { method: "POST" },
      );
      if (win) win.location.href = url;
      else window.location.assign(url);
    } catch (err) {
      win?.close();
      setLinkError(
        err instanceof Error ? err.message : "No pudimos abrir Stripe",
      );
    } finally {
      setOpening(false);
    }
  };

  if (error && !data) {
    return <p className="text-sm text-slate-500 mt-4">{error}</p>;
  }
  if (!data) {
    return <p className="text-sm text-slate-500 mt-4">Cargando saldo...</p>;
  }
  if (!data.connected) return null;

  const tiles = [
    {
      label: "En proceso",
      cents: data.pending_cents,
      hint: "Cobrado, Stripe aún no lo libera",
    },
    {
      label: "Disponible",
      cents: data.available_cents,
      hint: "Sale en el próximo depósito",
    },
    {
      label: "En camino a tu banco",
      cents: data.in_transit_cents,
      hint: "Depósito ya enviado",
    },
  ];

  return (
    <div className="bg-white rounded-2xl p-6 mt-4">
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="font-medium text-slate-800">Tu dinero</p>
        <button
          onClick={openDashboard}
          disabled={opening}
          className="flex items-center gap-1.5 text-sm text-ink hover:text-ink-soft cursor-pointer disabled:opacity-60"
        >
          {opening ? "Abriendo..." : "Ver en Stripe"}
          <ExternalLink size={14} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="bg-surface rounded-xl p-4">
            <p className="text-xs text-slate-500">{t.label}</p>
            <p className="text-2xl font-semibold text-ink mt-1">
              ${money(t.cents)}
            </p>
            <p className="text-xs text-slate-400 mt-1">{t.hint}</p>
          </div>
        ))}
      </div>

      {scheduleText(data.schedule) && (
        <p className="text-xs text-slate-500 mt-3">
          {scheduleText(data.schedule)}
        </p>
      )}

      <p className="text-sm font-medium text-slate-800 mt-6 mb-2">
        Depósitos a tu banco
      </p>
      {data.payouts.length === 0 ? (
        <p className="text-sm text-slate-500">
          Todavía no hay depósitos. El primero puede tardar unos días más que
          los siguientes mientras Stripe revisa tu cuenta.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {data.payouts.map((p) => {
            const s = STATUS[p.status] ?? STATUS.pending;
            return (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div>
                  <p className="text-sm text-slate-800">
                    ${money(p.amount_cents)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {p.status === "paid" ? "Llegó el " : "Llega el "}
                    {arrival(p.arrival_date)}
                  </p>
                </div>
                <span
                  className={`text-xs px-2.5 py-1 rounded-full ${s.className}`}
                >
                  {s.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {linkError && <p className="text-sm text-red-500 mt-3">{linkError}</p>}
    </div>
  );
}
