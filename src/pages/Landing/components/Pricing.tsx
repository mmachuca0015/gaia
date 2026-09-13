import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import {
  fetchPlans,
  monthlyPrice,
  annualTotal,
  introPrice,
  toPesos,
  formatMoney,
  type Plan,
} from "../../../lib/plans";

function Pricing() {
  const [annual, setAnnual] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState(false);

  // Los precios vienen de la API. Si el admin cambia uno, esta seccion lo
  // refleja en la siguiente visita sin volver a desplegar la landing.
  useEffect(() => {
    fetchPlans()
      .then(setPlans)
      .catch(() => setError(true));
  }, []);

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
                -{plans[0]?.annual_discount ?? 15}%
              </span>
            </button>
          </div>
        </div>

        {error ? (
          <p className="text-center text-slate-500 text-sm">
            No pudimos cargar los planes. Vuelve a intentarlo en un momento.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto">
            {/* Esqueletos mientras carga, para que la seccion no salte de alto */}
            {plans.length === 0
              ? [0, 1].map((i) => (
                  <div
                    key={i}
                    className="rounded-2xl border border-line bg-surface p-8 h-[520px] animate-pulse"
                  />
                ))
              : plans.map((plan) => (
                  <div
                    key={plan.id}
                    className={`rounded-2xl p-8 border flex flex-col ${
                      plan.is_featured
                        ? "bg-ink border-ink"
                        : "bg-surface border-line"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p
                        className={`text-2xl font-semibold ${
                          plan.is_featured ? "text-white" : "text-ink"
                        }`}
                        style={{ fontFamily: "Cormorant Garamond, serif" }}
                      >
                        {plan.name}
                      </p>
                      {plan.is_featured && (
                        <span className="text-[10px] tracking-[0.2em] text-slate-300 border border-white/25 px-2.5 py-1 rounded-full">
                          POPULAR
                        </span>
                      )}
                    </div>

                    <p
                      className={`text-sm mb-6 ${
                        plan.is_featured ? "text-slate-400" : "text-slate-500"
                      }`}
                    >
                      {plan.tagline}
                    </p>

                    <div className="mb-6">
                      <div className="flex items-baseline gap-1.5">
                        <span
                          className={`text-5xl font-semibold ${
                            plan.is_featured ? "text-white" : "text-ink"
                          }`}
                          style={{ fontFamily: "Cormorant Garamond, serif" }}
                        >
                          ${formatMoney(monthlyPrice(plan, annual))}
                        </span>
                        <span
                          className={`text-sm ${
                            plan.is_featured ? "text-slate-400" : "text-slate-500"
                          }`}
                        >
                          {plan.currency.toUpperCase()} / mes
                        </span>
                      </div>

                      <p
                        className={`text-xs mt-2 ${
                          plan.is_featured ? "text-slate-400" : "text-slate-500"
                        }`}
                      >
                        {annual ? (
                          <>
                            <span className="line-through">
                              ${formatMoney(toPesos(plan.price_cents) * 12)}
                            </span>{" "}
                            · facturado ${formatMoney(annualTotal(plan))} al año
                          </>
                        ) : (
                          "Facturado mes a mes. Cancela cuando quieras."
                        )}
                      </p>

                      {!annual && plan.intro_discount > 0 && (
                        <p
                          className={`text-xs mt-2 px-2.5 py-1.5 rounded-lg inline-block ${
                            plan.is_featured
                              ? "bg-white/10 text-white"
                              : "bg-ink/5 text-ink"
                          }`}
                        >
                          Tu primer mes: ${formatMoney(introPrice(plan))} ·{" "}
                          {plan.intro_discount}% de descuento
                        </p>
                      )}
                    </div>

                    <ul className="flex flex-col gap-3 mb-8">
                      {plan.features.map((f) => (
                        <li key={f.id} className="flex gap-3 items-start">
                          <Check
                            size={15}
                            className={`mt-0.5 shrink-0 ${
                              plan.is_featured ? "text-white" : "text-ink"
                            }`}
                          />
                          <span
                            className={`text-sm leading-relaxed ${
                              plan.is_featured
                                ? "text-slate-200"
                                : "text-slate-500"
                            }`}
                          >
                            {f.label}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <a
                      href="#demo"
                      className={`mt-auto text-center text-sm font-medium px-6 py-3.5 rounded-full transition-colors ${
                        plan.is_featured
                          ? "bg-white text-ink hover:bg-slate-200"
                          : "bg-ink text-white hover:bg-ink-soft"
                      }`}
                    >
                      Agenda un demo gratis
                    </a>
                  </div>
                ))}
          </div>
        )}

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
