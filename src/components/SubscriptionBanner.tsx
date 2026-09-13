import { useEffect, useState } from "react";
import { AlertCircle, X } from "lucide-react";

import { apiJson } from "../lib/api";
import SubscriptionPayment from "./SubscriptionPayment";

type SubscriptionStatus = {
  status: "pendiente" | "activa" | "vencida" | "cancelada" | "heredada";
  plan_name?: string;
  billing_interval?: "month" | "year";
};

/* Aviso de suscripcion sin pagar.
   El estado lo manda el backend a partir del webhook de Stripe: haber
   confirmado en el navegador no prueba que el cobro cerro. */
function SubscriptionBanner() {
  const [sub, setSub] = useState<SubscriptionStatus | null>(null);
  const [paying, setPaying] = useState(false);

  const load = () =>
    apiJson<SubscriptionStatus>("/subscriptions/me")
      .then(setSub)
      .catch(() => setSub(null));

  useEffect(() => {
    load();
  }, []);

  // 'heredada' son los dueños que existian antes de que hubiera planes: no se
  // les bloquea ni se les molesta con un aviso.
  if (!sub || sub.status === "activa" || sub.status === "heredada") return null;

  const copy = {
    pendiente: {
      title: "Tu suscripción está pendiente de pago",
      body: "Tu estudio ya está creado, pero no aparecerá en el marketplace hasta que completes el pago.",
      cta: "Completar pago",
    },
    vencida: {
      title: "No pudimos cobrar tu suscripción",
      body: "Actualiza tu método de pago para que tu estudio siga publicado.",
      cta: "Actualizar pago",
    },
    cancelada: {
      title: "Tu suscripción está cancelada",
      body: "Reactívala cuando quieras para volver a publicar tu estudio.",
      cta: "Reactivar",
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
          onClick={() => setPaying(true)}
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
