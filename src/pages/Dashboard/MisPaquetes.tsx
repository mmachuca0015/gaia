import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package } from "lucide-react";

import {
  classesText,
  fetchMyPackages,
  formatDateTime,
  kindText,
  money,
  validityLabel,
  type PurchasedPackage,
} from "../../lib/packages";

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-slate-400 text-xs mb-0.5">{label}</dt>
      <dd className="text-slate-800">{children}</dd>
    </div>
  );
}

// Un paquete ya no sirve si se vencio o se acabaron sus clases.
function isUsable(p: PurchasedPackage) {
  return !p.expired && p.remaining > 0;
}

function MisPaquetes() {
  const navigate = useNavigate();
  const [packages, setPackages] = useState<PurchasedPackage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<PurchasedPackage | null>(null);

  useEffect(() => {
    fetchMyPackages().then((data) => {
      setPackages(data);
      setLoaded(true);
    });
  }, []);

  // "Precio con descuento" solo si pago menos que el precio normal.
  const discounted =
    selected?.list_price_cents != null &&
    selected.list_price_cents > selected.price_cents;

  return (
    <div className="p-4 md:p-8">
      <div className="mb-10">
        <h1
          className="text-4xl md:text-6xl font-semibold text-slate-800"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Mis <span className="text-ink">paquetes</span>
        </h1>
      </div>

      {loaded && packages.length === 0 && (
        <div className="bg-white border border-dashed border-line rounded-2xl p-10 text-center max-w-lg">
          <Package size={28} className="mx-auto text-slate-400 mb-3" />
          <p className="text-slate-800 font-medium mb-1">
            Aún no tienes paquetes
          </p>
          <p className="text-sm text-slate-500 mb-5">
            Los encuentras en la pestaña Paquetes de cada estudio.
          </p>
          <button
            onClick={() => navigate("/explorar")}
            className="bg-ink text-white px-5 py-2.5 rounded-xl text-sm hover:bg-ink-soft transition-colors cursor-pointer"
          >
            Explorar estudios
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {packages.map((p) => {
          const usable = isUsable(p);
          return (
            <div
              key={p.id}
              className={`bg-white border border-line rounded-2xl p-6 flex flex-col gap-4 ${
                usable ? "" : "opacity-55"
              }`}
            >
              <div>
                <p className="text-sm text-slate-500">{p.studio_name}</p>
                <p className="font-semibold text-slate-800 text-lg leading-snug">
                  {p.name}
                </p>
              </div>

              <p className="text-sm text-slate-600">
                Clases restantes:{" "}
                <span
                  className="text-2xl font-semibold text-ink align-middle"
                  style={{ fontFamily: "Cormorant Garamond, serif" }}
                >
                  {p.remaining}
                </span>
              </p>

              {!usable && (
                <p className="text-xs text-slate-500 -mt-2">
                  {p.expired
                    ? `Venció el ${formatDateTime(p.expires_at)}`
                    : "Ya usaste todas sus clases"}
                </p>
              )}

              <div className="flex gap-3 mt-auto">
                <button
                  onClick={() => setSelected(p)}
                  className="flex-1 text-sm font-medium text-ink border border-line rounded-xl py-2.5 hover:bg-surface transition-colors cursor-pointer"
                >
                  Ver más
                </button>
                {usable && (
                  <button
                    onClick={() => navigate(`/studios/${p.studio_id}`)}
                    className="flex-1 text-sm font-medium bg-ink text-white rounded-xl py-2.5 hover:bg-ink-soft transition-colors cursor-pointer"
                  >
                    Reservar clase
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Ver mas: todo lo que compro, tal como se le confirmo */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md max-h-[90vh] overflow-y-auto flex flex-col gap-5">
            <div className="text-center">
              <p className="text-sm text-slate-500">{selected.studio_name}</p>
              <p className="font-semibold text-slate-800 text-xl">
                {selected.name}
              </p>
            </div>

            <dl className="text-sm flex flex-col gap-3 border-t border-line pt-4">
              <Row label="Precio">
                ${money(selected.list_price_cents ?? selected.price_cents)} MXN
              </Row>
              {discounted && (
                <Row label="Precio con descuento">
                  ${money(selected.price_cents)} MXN
                </Row>
              )}
              <Row label="Duración">
                {selected.validity_value && selected.validity_unit
                  ? `${validityLabel(selected.validity_value, selected.validity_unit)} · `
                  : ""}
                {selected.expired ? "venció" : "vence"} el{" "}
                {formatDateTime(selected.expires_at)}
              </Row>
              <Row label="Clases que puedes usar">
                {classesText(selected.any_class, selected.classes)}
              </Row>
              <Row label="Tipo de clases">
                {kindText(selected.permanent_only)}
              </Row>
              <Row label="Clases por canjear">
                {selected.remaining} de {selected.classes_total}
              </Row>
            </dl>

            <div className="flex gap-3">
              <button
                onClick={() => setSelected(null)}
                className="flex-1 border border-line text-slate-600 py-2.5 rounded-xl text-sm hover:bg-surface transition-colors cursor-pointer"
              >
                Cerrar
              </button>
              {isUsable(selected) && (
                <button
                  onClick={() => navigate(`/studios/${selected.studio_id}`)}
                  className="flex-1 bg-ink text-white py-2.5 rounded-xl text-sm hover:bg-ink-soft transition-colors cursor-pointer"
                >
                  Reservar clase
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MisPaquetes;
