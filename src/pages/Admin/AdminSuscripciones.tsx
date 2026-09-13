import { useEffect, useState } from "react";
import { Plus, X, Star, Check, CreditCard } from "lucide-react";

import { api, apiJson } from "../../lib/api";
import {
  toPesos,
  formatMoney,
  introPrice,
  annualTotal,
  type Plan,
} from "../../lib/plans";

/* Panel de planes.
   Lo que se cambia aqui es lo que ven la landing y el paso de plan del
   registro, porque las tres vistas leen de la misma tabla. */
function AdminSuscripciones() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Borrador del precio por plan: se escribe libre y solo se guarda al
  // confirmar, para no mandar una peticion por cada tecla.
  const [priceDraft, setPriceDraft] = useState<Record<number, string>>({});
  const [featureDraft, setFeatureDraft] = useState<Record<number, string>>({});

  const load = async () => {
    try {
      const data = await apiJson<Plan[]>("/plans/all");
      setPlans(data);
      setPriceDraft(
        Object.fromEntries(data.map((p) => [p.id, String(toPesos(p.price_cents))])),
      );
      setError("");
    } catch {
      setError("No pudimos cargar los planes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const patchPlan = async (id: number, body: Record<string, unknown>) => {
    const res = await api(`/plans/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error || "No pudimos guardar el cambio");
      return;
    }
    load();
  };

  const savePrice = (plan: Plan) => {
    const raw = priceDraft[plan.id];
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      alert("El precio debe ser un numero valido");
      return;
    }
    if (value === toPesos(plan.price_cents)) return;
    patchPlan(plan.id, { price: value });
  };

  const addFeature = async (planId: number) => {
    const label = (featureDraft[planId] || "").trim();
    if (!label) return;
    const res = await api(`/plans/${planId}/features`, {
      method: "POST",
      body: JSON.stringify({ label }),
    });
    if (!res.ok) {
      alert("No pudimos agregar la caracteristica");
      return;
    }
    setFeatureDraft({ ...featureDraft, [planId]: "" });
    load();
  };

  const removeFeature = async (planId: number, featureId: number) => {
    const res = await api(`/plans/${planId}/features/${featureId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      alert("No pudimos eliminar la caracteristica");
      return;
    }
    load();
  };

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1
          className="text-4xl md:text-6xl font-semibold text-slate-800"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Planes{" "}
          <span
            className="text-[#1b2c44]"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            de suscripción
          </span>
        </h1>
        <p className="text-slate-600 mt-2">
          Lo que cambies aquí se refleja en la landing y en el registro de
          estudios.
        </p>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl p-10 text-center text-slate-500">
          Cargando...
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl p-10 text-center text-slate-500">
          {error}
        </div>
      ) : plans.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 flex flex-col items-center gap-4 text-center">
          <CreditCard size={36} className="text-slate-300" />
          <p className="text-slate-600 font-medium">No hay planes todavía</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`bg-white rounded-2xl p-6 border ${
                plan.is_active ? "border-slate-200" : "border-slate-200 opacity-60"
              }`}
            >
              {/* Encabezado */}
              <div className="flex items-start justify-between mb-5">
                <div>
                  <p
                    className="text-2xl font-semibold text-slate-800"
                    style={{ fontFamily: "Cormorant Garamond, serif" }}
                  >
                    {plan.name}
                  </p>
                  <p className="text-xs text-slate-400">{plan.slug}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      patchPlan(plan.id, { is_featured: !plan.is_featured })
                    }
                    title="Marcar como destacado"
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-colors cursor-pointer ${
                      plan.is_featured
                        ? "bg-[#1b2c44] text-white"
                        : "border border-slate-200 text-slate-500 hover:border-slate-400"
                    }`}
                  >
                    <Star size={12} />
                    Destacado
                  </button>
                  <button
                    onClick={() =>
                      patchPlan(plan.id, { is_active: !plan.is_active })
                    }
                    className={`px-3 py-1.5 rounded-full text-xs transition-colors cursor-pointer ${
                      plan.is_active
                        ? "bg-[#e8eef7] text-[#1b2c44]"
                        : "border border-slate-200 text-slate-500"
                    }`}
                  >
                    {plan.is_active ? "Activo" : "Inactivo"}
                  </button>
                </div>
              </div>

              {/* Precio */}
              <div className="mb-5">
                <label className="text-xs text-slate-400 block mb-1.5">
                  Precio mensual ({plan.currency.toUpperCase()})
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                      $
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={priceDraft[plan.id] ?? ""}
                      onChange={(e) =>
                        setPriceDraft({
                          ...priceDraft,
                          [plan.id]: e.target.value,
                        })
                      }
                      onKeyDown={(e) => e.key === "Enter" && savePrice(plan)}
                      className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 transition-colors"
                    />
                  </div>
                  <button
                    onClick={() => savePrice(plan)}
                    className="px-5 py-2.5 rounded-xl bg-[#1b2c44] text-white text-sm font-medium hover:bg-[#33506f] transition-colors cursor-pointer"
                  >
                    Guardar
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  Primer mes: ${formatMoney(introPrice(plan))} con{" "}
                  {plan.intro_discount}% de descuento
                </p>
              </div>

              {/* Descuentos. No se acumulan: el anual sustituye al de
                  bienvenida cuando el dueño paga el año completo. */}
              <div className="mb-5 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">
                    Descuento primer mes (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={plan.intro_discount}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (n !== plan.intro_discount) {
                        patchPlan(plan.id, { intro_discount: n });
                      }
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">
                    Descuento anual (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={plan.annual_discount}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (n !== plan.annual_discount) {
                        patchPlan(plan.id, { annual_discount: n });
                      }
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 transition-colors"
                  />
                  <p className="text-xs text-slate-400 mt-1.5">
                    ${formatMoney(annualTotal(plan))} al año
                  </p>
                </div>
              </div>

              {/* Caracteristicas */}
              <div>
                <p className="text-xs text-slate-400 mb-2">Características</p>
                <ul className="flex flex-col gap-1.5 mb-3">
                  {plan.features.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-slate-50 group"
                    >
                      <span className="flex items-start gap-2 text-sm text-slate-600">
                        <Check
                          size={13}
                          className="text-[#1b2c44] mt-1 shrink-0"
                        />
                        {f.label}
                      </span>
                      <button
                        onClick={() => removeFeature(plan.id, f.id)}
                        title="Quitar"
                        className="text-slate-300 hover:text-slate-600 transition-colors cursor-pointer shrink-0"
                      >
                        <X size={15} />
                      </button>
                    </li>
                  ))}
                  {plan.features.length === 0 && (
                    <li className="text-sm text-slate-400 px-3 py-2">
                      Sin características todavía
                    </li>
                  )}
                </ul>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Agregar característica..."
                    value={featureDraft[plan.id] ?? ""}
                    onChange={(e) =>
                      setFeatureDraft({
                        ...featureDraft,
                        [plan.id]: e.target.value,
                      })
                    }
                    onKeyDown={(e) => e.key === "Enter" && addFeature(plan.id)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 transition-colors"
                  />
                  <button
                    onClick={() => addFeature(plan.id)}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm hover:border-slate-400 transition-colors cursor-pointer"
                  >
                    <Plus size={15} />
                    Agregar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AdminSuscripciones;
