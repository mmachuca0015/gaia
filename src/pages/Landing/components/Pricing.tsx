import { useState } from "react";
import { Check } from "lucide-react";

const ANNUAL_DISCOUNT = 0.15;

/* PLACEHOLDER: precios y features de ejemplo para ver el diseño.
   Cambiar por los reales cuando estén definidos. */
const plans = [
  {
    name: "Light",
    price: 199,
    tagline: "Para estudios que empiezan a llenar su agenda.",
    featured: false,
    features: [
      "Perfil en el marketplace",
      "Hasta 3 instructores",
      "Agenda y reservaciones ilimitadas",
      "Cobros con Stripe Connect",
      "Confirmaciones por correo",
      "Panel de ingresos básico",
    ],
  },
  {
    name: "Pro",
    price: 399,
    tagline: "Para estudios con varias clases al día y equipo completo.",
    featured: true,
    features: [
      "Todo lo de Light",
      "Instructores ilimitados",
      "Gráficas de ingresos por período",
      "Actividad reciente en tiempo real",
      "Posición destacada en el marketplace",
      "Galería de fotos ampliada",
      "Soporte prioritario",
    ],
  },
];

function Pricing() {
  const [annual, setAnnual] = useState(false);

  /* El precio grande siempre se muestra por mes: en anual es el mensual con el
     descuento aplicado, y abajo va el total que se factura de una vez. */
  const monthlyPrice = (price: number) =>
    annual ? Math.round(price * (1 - ANNUAL_DISCOUNT)) : price;
  const annualTotal = (price: number) =>
    Math.round(price * 12 * (1 - ANNUAL_DISCOUNT));

  return (
    <section id="precios" className="bg-paper py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <p className="text-[11px] tracking-[0.25em] text-slate-400 mb-4">
            PRECIOS
          </p>
          <h2
            className="text-4xl md:text-5xl font-semibold text-ink leading-tight mb-5"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            Todas las funciones,
            <br />
            <span className="italic">a un precio que sí cierra</span>
          </h2>
          <p className="text-slate-500 leading-relaxed">
            Un marketplace completo por menos de lo que cuesta un software de
            agenda. Sin contratos forzosos y sin costo de instalación.
          </p>
        </div>

        {/* Switch mensual / anual */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex items-center gap-1 p-1 rounded-full border border-line bg-surface">
            <button
              onClick={() => setAnnual(false)}
              className={`px-5 py-2 rounded-full text-sm transition-colors cursor-pointer ${
                annual ? "text-slate-500 hover:text-ink" : "bg-ink text-white"
              }`}
            >
              Mensual
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm transition-colors cursor-pointer ${
                annual ? "bg-ink text-white" : "text-slate-500 hover:text-ink"
              }`}
            >
              Anual
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full ${
                  annual ? "bg-white/15 text-white" : "bg-ink/8 text-ink"
                }`}
              >
                -15%
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl p-8 border flex flex-col ${
                plan.featured ? "bg-ink border-ink" : "bg-surface border-line"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <p
                  className={`text-2xl font-semibold ${
                    plan.featured ? "text-white" : "text-ink"
                  }`}
                  style={{ fontFamily: "Cormorant Garamond, serif" }}
                >
                  {plan.name}
                </p>
                {plan.featured && (
                  <span className="text-[10px] tracking-[0.2em] text-slate-300 border border-white/25 px-2.5 py-1 rounded-full">
                    POPULAR
                  </span>
                )}
              </div>

              <p
                className={`text-sm mb-6 ${
                  plan.featured ? "text-slate-400" : "text-slate-500"
                }`}
              >
                {plan.tagline}
              </p>

              <div className="mb-6">
                <div className="flex items-baseline gap-1.5">
                  <span
                    className={`text-5xl font-semibold ${
                      plan.featured ? "text-white" : "text-ink"
                    }`}
                    style={{ fontFamily: "Cormorant Garamond, serif" }}
                  >
                    ${monthlyPrice(plan.price)}
                  </span>
                  <span
                    className={`text-sm ${
                      plan.featured ? "text-slate-400" : "text-slate-500"
                    }`}
                  >
                    MXN / mes
                  </span>
                </div>

                <p
                  className={`text-xs mt-2 ${
                    plan.featured ? "text-slate-400" : "text-slate-500"
                  }`}
                >
                  {annual ? (
                    <>
                      <span className="line-through">${plan.price}</span> ·
                      facturado ${annualTotal(plan.price).toLocaleString("es-MX")}{" "}
                      al año
                    </>
                  ) : (
                    "Facturado mes a mes. Cancela cuando quieras."
                  )}
                </p>
              </div>

              <ul className="flex flex-col gap-3 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-3 items-start">
                    <Check
                      size={15}
                      className={`mt-0.5 shrink-0 ${
                        plan.featured ? "text-white" : "text-ink"
                      }`}
                    />
                    <span
                      className={`text-sm leading-relaxed ${
                        plan.featured ? "text-slate-200" : "text-slate-500"
                      }`}
                    >
                      {f}
                    </span>
                  </li>
                ))}
              </ul>

              <a
                href="#demo"
                className={`mt-auto text-center text-sm font-medium px-6 py-3.5 rounded-full transition-colors ${
                  plan.featured
                    ? "bg-white text-ink hover:bg-slate-200"
                    : "bg-ink text-white hover:bg-ink-soft"
                }`}
              >
                Agenda un demo gratis
              </a>
            </div>
          ))}
        </div>

        <div className="max-w-3xl mx-auto mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="border border-line rounded-2xl p-5">
            <p className="text-sm font-medium text-ink mb-1">
              Gratis para quienes reservan
            </p>
            <p className="text-sm text-slate-500 leading-relaxed">
              Los atletas no pagan suscripción: solo el precio de su clase.
            </p>
          </div>
          <div className="border border-line rounded-2xl p-5">
            <p className="text-sm font-medium text-ink mb-1">
              Sin contratos forzosos
            </p>
            <p className="text-sm text-slate-500 leading-relaxed">
              Cambias de plan o te das de baja cuando quieras, desde tu panel.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Pricing;
