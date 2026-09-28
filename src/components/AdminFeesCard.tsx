import { useEffect, useState } from "react";
import { Percent } from "lucide-react";

import { api, apiJson } from "../lib/api";
import {
  forgetFees,
  formatPercent,
  serviceFeeCents,
  type Fees,
} from "../lib/fees";

// Precio de ejemplo para enseñar en pesos lo que mueve el cambio.
const EXAMPLE_CENTS = 15000;

function pesos(cents: number) {
  return `$${(cents / 100).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/* Comisiones de Wellco: el cargo por servicio del alumno y la comision del
   estudio. Viven en la tabla fee_settings; cambiarlas mueve el cobro, el
   desglose del alumno, la landing y las graficas sin desplegar. Lo ya cobrado
   no cambia: cada cobro guardo los suyos. */
function AdminFeesCard() {
  const [fees, setFees] = useState<Fees | null>(null);
  const [service, setService] = useState("");
  const [commission, setCommission] = useState("");
  const [error, setError] = useState("");
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiJson<Fees>("/admin/fees")
      .then((f) => {
        setFees(f);
        setService(String(f.service_fee_percent));
        setCommission(String(f.commission_percent));
      })
      .catch(() => setError("No pudimos cargar las comisiones"));
  }, []);

  const nextService = Number(service);
  const nextCommission = Number(commission);
  const valid =
    service.trim() !== "" &&
    commission.trim() !== "" &&
    Number.isFinite(nextService) &&
    Number.isFinite(nextCommission) &&
    nextService >= 0 &&
    nextService <= 20 &&
    nextCommission >= 0 &&
    nextCommission <= 20;
  const changed =
    fees !== null &&
    (nextService !== fees.service_fee_percent ||
      nextCommission !== fees.commission_percent);

  const guardar = async () => {
    setSaving(true);
    setError("");
    const res = await api("/admin/fees", {
      method: "PUT",
      body: JSON.stringify({
        service_fee_percent: nextService,
        commission_percent: nextCommission,
      }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    setAsking(false);
    if (!res.ok) {
      setError(data?.error || "No pudimos guardar las comisiones");
      return;
    }
    if (!data?.unchanged) {
      setFees(data);
      setService(String(data.service_fee_percent));
      setCommission(String(data.commission_percent));
    }
    // Esta pestaña tenia los viejos cacheados.
    forgetFees();
  };

  // Un cobro de ejemplo, antes y despues.
  const ejemplo = (f: Fees) => {
    const cargo = serviceFeeCents(EXAMPLE_CENTS, f.service_fee_percent);
    const comision = Math.round(
      (EXAMPLE_CENTS * f.commission_percent) / 100,
    );
    return { alumno: EXAMPLE_CENTS + cargo, wellco: cargo + comision };
  };

  const input =
    "w-24 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-right focus:outline-none focus:border-slate-400";

  return (
    <div className="bg-white rounded-2xl p-5 mb-8">
      <div className="flex items-center gap-2 mb-1">
        <Percent size={18} className="text-slate-500" />
        <p className="font-semibold text-slate-800">Comisiones por cobro</p>
      </div>
      <p className="text-sm text-slate-500 mb-5">
        Se calculan sobre el precio de la clase o del paquete. El cambio aplica
        desde el siguiente cobro; lo ya cobrado no se modifica.
      </p>

      {!fees && !error ? (
        <p className="text-sm text-slate-500">Cargando...</p>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <label className="text-sm text-slate-600">
            <span className="block mb-1">Cargo por servicio al alumno</span>
            <span className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                max="20"
                value={service}
                onChange={(e) => setService(e.target.value)}
                className={input}
              />
              %
            </span>
          </label>

          <label className="text-sm text-slate-600">
            <span className="block mb-1">Comisión al estudio</span>
            <span className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                max="20"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
                className={input}
              />
              %
            </span>
          </label>

          <button
            onClick={() => setAsking(true)}
            disabled={!valid || !changed || saving}
            className="bg-ink text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-ink-soft transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Guardar
          </button>
        </div>
      )}

      {service !== "" && commission !== "" && !valid && (
        <p className="text-sm text-red-600 mt-3">
          Los porcentajes deben ir de 0 a 20.
        </p>
      )}
      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

      {asking && fees && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md p-6">
            <p className="font-semibold text-slate-800">
              ¿Cambiar las comisiones?
            </p>

            <div className="text-sm text-slate-600 mt-4 space-y-1">
              <p>
                Cargo al alumno: {formatPercent(fees.service_fee_percent)}% →{" "}
                <span className="font-semibold text-slate-800">
                  {formatPercent(nextService)}%
                </span>
              </p>
              <p>
                Comisión al estudio: {formatPercent(fees.commission_percent)}% →{" "}
                <span className="font-semibold text-slate-800">
                  {formatPercent(nextCommission)}%
                </span>
              </p>
            </div>

            {(() => {
              const antes = ejemplo(fees);
              const despues = ejemplo({
                service_fee_percent: nextService,
                commission_percent: nextCommission,
              });
              return (
                <div className="bg-surface rounded-xl p-4 mt-4 text-sm text-slate-600 space-y-1">
                  <p className="text-xs text-slate-400 mb-1">
                    En una clase de {pesos(EXAMPLE_CENTS)}
                  </p>
                  <p>
                    El alumno paga {pesos(antes.alumno)} →{" "}
                    <span className="font-semibold text-slate-800">
                      {pesos(despues.alumno)}
                    </span>
                  </p>
                  <p>
                    Wellco recibe {pesos(antes.wellco)} →{" "}
                    <span className="font-semibold text-slate-800">
                      {pesos(despues.wellco)}
                    </span>
                  </p>
                </div>
              );
            })()}

            <p className="text-sm text-slate-600 leading-relaxed mt-4">
              Aplica desde el siguiente cobro y se ve de inmediato en la
              landing, en el desglose que ve el alumno al reservar y en tus
              gráficas. Los cobros anteriores no cambian.
            </p>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setAsking(false)}
                disabled={saving}
                className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium hover:border-slate-400 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={saving}
                className="flex-1 bg-ink text-white py-2.5 rounded-xl text-sm font-medium hover:bg-ink-soft transition-colors cursor-pointer disabled:cursor-wait"
              >
                {saving ? "Guardando..." : "Sí, cambiarlas"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminFeesCard;
