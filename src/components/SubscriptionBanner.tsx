import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, X } from "lucide-react";

import {
  fetchOwnerSubscription,
  formatLongDate,
  stillPublished,
  type OwnerSubscription,
} from "../lib/subscription";
import SubscriptionPayment from "./SubscriptionPayment";

const SUBSCRIPTION_PATH = "/owner/estudio/suscripcion";

/* Aviso de suscripcion sin pagar o terminada.
   El estado lo manda el backend a partir del webhook de Stripe: haber
   confirmado en el navegador no prueba que el cobro cerro. */
function SubscriptionBanner() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [sub, setSub] = useState<OwnerSubscription | null>(null);
  const [paying, setPaying] = useState(false);

  const load = () =>
    fetchOwnerSubscription()
      .then(setSub)
      .catch(() => setSub(null));

  // Se relee al cambiar de pantalla: la de suscripcion puede haber cambiado
  // el estado (por ejemplo, al reactivar).
  useEffect(() => {
    load();
  }, [pathname]);

  // 'heredada' son los dueños que existian antes de que hubiera planes: no se
  // les bloquea ni se les molesta con un aviso.
  if (
    !sub ||
    sub.status === "activa" ||
    sub.status === "heredada" ||
    sub.status === "demo"
  ) {
    return null;
  }
  // En la pantalla de suscripcion el aviso sobra: ahi mismo se resuelve.
  if (sub.status === "cancelada" && pathname === SUBSCRIPTION_PATH) return null;

  const visibleUntil =
    stillPublished(sub) && sub.paid_until ? formatLongDate(sub.paid_until) : null;

  const copy = {
    pendiente: {
      title: "Tu suscripción está pendiente de pago",
      body: visibleUntil
        ? `Tu estudio seguirá visible hasta el ${visibleUntil}. Completa el pago para que no desaparezca del catálogo.`
        : "Tu estudio ya está creado, pero no aparecerá en el catálogo hasta que completes el pago.",
      cta: "Completar pago",
    },
    vencida: {
      title: "No pudimos cobrar tu suscripción",
      body: visibleUntil
        ? `Tu estudio seguirá visible hasta el ${visibleUntil}. Actualiza tu método de pago para que no desaparezca del catálogo.`
        : "Tu estudio ya no aparece en el catálogo. Actualiza tu método de pago para volver a publicarlo.",
      cta: "Actualizar pago",
    },
    cancelada: {
      title: "Tu suscripción terminó",
      body: "Tu estudio no aparece en el catálogo. Elige una suscripción para volver a publicarlo.",
      cta: "Elegir suscripción",
    },
  }[sub.status];

  return (
    <>
      <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <AlertCircle size={20} className="text-amber-700 shrink-0" />
        <div className="flex-1">
          <p className="font-medium text-amber-900">{copy.title}</p>
          <p className="text-sm text-amber-800 mt-0.5">{copy.body}</p>
        </div>
        <button
          onClick={() =>
            // Quien vuelve elige plan e intervalo antes de pagar; eso vive en
            // la pantalla de suscripcion.
            sub.status === "cancelada"
              ? navigate(SUBSCRIPTION_PATH)
              : setPaying(true)
          }
          className="px-5 py-2.5 rounded-full bg-[#1b2c44] text-white text-sm font-medium hover:bg-[#33506f] transition-colors cursor-pointer whitespace-nowrap"
        >
          {copy.cta}
        </button>
      </div>

      {/* El cobro ocurre aqui mismo: el dueño nunca sale del panel. */}
      {paying && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm">
            <div className="flex items-start justify-between mb-5">
              <div>
                <p className="font-semibold text-slate-800">Datos de pago</p>
                {sub.plan_name && (
                  <p className="text-xs text-slate-400">
                    Plan {sub.plan_name} ·{" "}
                    {sub.billing_interval === "year" ? "anual" : "mensual"}
                  </p>
                )}
              </div>
              <button
                onClick={() => setPaying(false)}
                className="text-slate-300 hover:text-slate-600 transition-colors cursor-pointer"
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>

            <SubscriptionPayment
              cta="Pagar y activar"
              onSuccess={() => {
                setPaying(false);
                // El webhook tarda un instante en marcarla activa; se relee
                // para que el aviso desaparezca solo.
                setTimeout(load, 1500);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

export default SubscriptionBanner;
