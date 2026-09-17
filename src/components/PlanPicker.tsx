import { Check } from "lucide-react";
import {
  toPesos,
  formatMoney,
  introPrice,
  annualTotal,
  monthlyPrice,
  type Plan,
  type BillingInterval,
} from "../lib/plans";

type PlanPickerProps = {
  plans: Plan[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  interval: BillingInterval;
  onIntervalChange: (interval: BillingInterval) => void;
  /** Si aplica el descuento del primer mes. Un estudio que vuelve no lo tiene. */
  introEligible?: boolean;
};

/* Tarjetas de plan del registro. Los datos son los mismos que pinta la
   landing, asi que un cambio de precio en el admin mueve las dos. */
function PlanPicker({
  plans,
  selectedId,
  onSelect,
  interval,
  onIntervalChange,
  introEligible = true,
}: PlanPickerProps) {
  if (plans.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-slate-200 bg-slate-50 h-80 animate-pulse"
          />
        ))}
      </div>
    );
  }

  const annual = interval === "year";
  // Todos los planes comparten el mismo porcentaje anual, asi que basta el
  // del primero para rotular el switch.
  const annualOff = plans[0]?.annual_discount ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Mensual / anual */}
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-1 p-1 rounded-full border border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={() => onIntervalChange("month")}
            className={`px-5 py-2 rounded-full text-sm transition-colors cursor-pointer ${
              annual ? "text-slate-500 hover:text-slate-800" : "bg-[#1b2c44] text-white"
            }`}
          >
            Mensual
          </button>
          <button
            type="button"
            onClick={() => onIntervalChange("year")}
            className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm transition-colors cursor-pointer ${
              annual ? "bg-[#1b2c44] text-white" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Anual
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full ${
                annual ? "bg-white/15 text-white" : "bg-[#e8eef7] text-[#1b2c44]"
              }`}
            >
              -{annualOff}%
            </span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {plans.map((plan) => {
          const selected = selectedId === plan.id;
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => onSelect(plan.id)}
              aria-pressed={selected}
              className={`text-left rounded-2xl p-5 border-2 transition-colors cursor-pointer flex flex-col ${
                selected
                  ? "border-[#1b2c44] bg-[#f4f7fa]"
                  : "border-slate-200 hover:border-slate-400"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <p
                  className="text-xl font-semibold text-slate-800"
                  style={{ fontFamily: "Cormorant Garamond, serif" }}
                >
                  {plan.name}
                </p>
                {/* El radio es un div, no un input: el boton entero ya es el
                    control y anidar un input haria doble foco. */}
                <span
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    selected ? "border-[#1b2c44]" : "border-slate-300"
                  }`}
                >
                  {selected && (
                    <span className="w-2 h-2 rounded-full bg-[#1b2c44]" />
                  )}
                </span>
              </div>

              {plan.tagline && (
                <p className="text-xs text-slate-400 mb-3">{plan.tagline}</p>
              )}

              <div className="flex items-baseline gap-1 mb-1">
                <span
                  className="text-3xl font-semibold text-slate-800"
                  style={{ fontFamily: "Cormorant Garamond, serif" }}
                >
                  ${formatMoney(monthlyPrice(plan, annual))}
                </span>
                <span className="text-xs text-slate-400">
                  {plan.currency.toUpperCase()} / mes
                </span>
              </div>

              {/* La linea de abajo dice exactamente que se va a cobrar hoy.
                  Los dos descuentos no se acumulan: el anual ya trae el suyo. */}
              {annual ? (
                <p className="text-xs text-[#1b2c44] bg-[#e8eef7] rounded-lg px-2 py-1 inline-block mb-3">
                  <span className="line-through text-slate-400">
                    ${formatMoney(toPesos(plan.price_cents) * 12)}
                  </span>{" "}
                  ${formatMoney(annualTotal(plan))} al año · {plan.annual_discount}%
                  menos
                </p>
              ) : introEligible && plan.intro_discount > 0 ? (
                <p className="text-xs text-[#1b2c44] bg-[#e8eef7] rounded-lg px-2 py-1 inline-block mb-3">
                  Primer mes ${formatMoney(introPrice(plan))} ·{" "}
                  {plan.intro_discount}% menos
                </p>
              ) : (
                <p className="text-xs text-slate-400 mb-3">
                  Facturado mes a mes
                </p>
              )}

              <ul className="flex flex-col gap-2 mt-2">
                {plan.features.map((f) => (
                  <li key={f.id} className="flex gap-2 items-start">
                    <Check size={13} className="text-[#1b2c44] mt-0.5 shrink-0" />
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
    </div>
  );
}

export default PlanPicker;
