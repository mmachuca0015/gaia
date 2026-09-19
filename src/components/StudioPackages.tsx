// Pestaña "Paquetes" de la pagina de un estudio: los paquetes que tiene a la
// venta, su detalle y la compra.
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package } from "lucide-react";

import { ApiError, getCachedUser } from "../lib/api";
import { fetchServiceFeePercent, serviceFeeCents } from "../lib/fees";
import {
  chargeCents,
  classesText,
  fetchStudioPackages,
  formatDateTime,
  kindText,
  money,
  purchasePackage,
  validityLabel,
  type CatalogPackage,
} from "../lib/packages";

const overlay =
  "fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4";
const secondaryBtn =
  "flex-1 border border-line text-slate-600 py-2.5 rounded-xl text-sm hover:bg-surface transition-colors cursor-pointer";
const primaryBtn =
  "flex-1 bg-ink text-white py-2.5 rounded-xl text-sm hover:bg-ink-soft transition-colors cursor-pointer disabled:opacity-50";

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

function StudioPackages({ studioId }: { studioId: number | string }) {
  const navigate = useNavigate();
  const [packages, setPackages] = useState<CatalogPackage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [feePercent, setFeePercent] = useState<number | null>(null);

  const load = useCallback(() => {
    fetchStudioPackages(studioId).then((data) => {
      setPackages(data);
      setLoaded(true);
    });
  }, [studioId]);

  useEffect(load, [load]);
  useEffect(() => {
    fetchServiceFeePercent()
      .then(setFeePercent)
      .catch(() => setFeePercent(null));
  }, []);

  // Paquete abierto en "Ver más", y si ya se esta confirmando la compra.
  const [selected, setSelected] = useState<CatalogPackage | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [needsCard, setNeedsCard] = useState(false);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState("");
  const [bought, setBought] = useState<{
    name: string;
    expiresAt: string;
  } | null>(null);

  const user = getCachedUser();
  const isDemo = user?.is_demo === true;

  const close = () => {
    setSelected(null);
    setConfirming(false);
    setBuyError("");
  };

  const startPurchase = () => {
    // Sin tarjeta no hay con que cobrar. Las cuentas demo no la necesitan.
    if (!isDemo && !user?.stripe_customer_id) {
      setNeedsCard(true);
      return;
    }
    setBuyError("");
    setConfirming(true);
  };

  const handleBuy = async () => {
    if (!selected) return;
    setBuying(true);
    setBuyError("");
    try {
      const res = await purchasePackage(selected.id);
      setBought({ name: selected.name, expiresAt: res.expiresAt });
      close();
      load();
    } catch (err) {
      setBuyError(
        err instanceof ApiError
          ? err.message
          : "No pudimos completar la compra",
      );
    } finally {
      setBuying(false);
    }
  };

  // Desglose que se muestra al confirmar: misma formula que el backend.
  const base = selected ? chargeCents(selected) : 0;
  const fee = feePercent !== null ? serviceFeeCents(base, feePercent) : null;

  return (
    <div className="px-6 pb-8">
      {loaded && packages.length === 0 && (
        <div className="bg-white border border-dashed border-line rounded-2xl p-10 text-center">
          <Package size={28} className="mx-auto text-slate-400 mb-3" />
          <p className="text-slate-800 font-medium">
            Este estudio aún no tiene paquetes a la venta
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {packages.map((p) => (
          <div
            key={p.id}
            className="bg-white border border-line rounded-2xl p-6 flex flex-col gap-3"
          >
            <div>
              <p className="font-semibold text-slate-800 text-lg leading-snug">
                {p.name}
              </p>
              <p className="text-sm text-slate-500">
                {p.class_count} {p.class_count === 1 ? "clase" : "clases"} ·
                dura {validityLabel(p.validity_value, p.validity_unit)}
              </p>
            </div>
            <p
              className="text-3xl font-semibold text-ink"
              style={{ fontFamily: "Cormorant Garamond, serif" }}
            >
              ${money(chargeCents(p))}
              {p.sale_price_cents != null && (
                <span className="text-base text-slate-400 line-through font-sans ml-2">
                  ${money(p.price_cents)}
                </span>
              )}
            </p>
            <button
              onClick={() => setSelected(p)}
              className="mt-auto text-sm font-medium text-ink border border-line rounded-xl py-2.5 hover:bg-surface transition-colors cursor-pointer"
            >
              Ver más
            </button>
          </div>
        ))}
      </div>

      {/* Ver mas: toda la informacion del paquete */}
      {selected && !confirming && (
        <div className={overlay}>
          <div className="bg-white rounded-2xl p-8 w-full max-w-md max-h-[90vh] overflow-y-auto flex flex-col gap-5">
            <div className="text-center">
              <p className="font-semibold text-slate-800 text-xl">
                {selected.name}
              </p>
              <p className="text-sm text-slate-500">{selected.studio_name}</p>
            </div>

            <p
              className="text-4xl font-semibold text-ink text-center"
              style={{ fontFamily: "Cormorant Garamond, serif" }}
            >
              ${money(chargeCents(selected))}{" "}
              <span className="text-xs text-slate-400 font-sans">MXN</span>
              {selected.sale_price_cents != null && (
                <span className="block text-sm text-slate-400 font-sans">
                  Antes{" "}
                  <span className="line-through">
                    ${money(selected.price_cents)}
                  </span>
                </span>
              )}
            </p>

            <dl className="text-sm flex flex-col gap-3 border-t border-line pt-4">
              <Row label="Clases incluidas">
                {selected.class_count}{" "}
                {selected.class_count === 1 ? "clase" : "clases"} ($
                {money(
                  Math.round(chargeCents(selected) / selected.class_count),
                )}{" "}
                c/u)
              </Row>
              <Row label="Duración">
                {validityLabel(selected.validity_value, selected.validity_unit)}{" "}
                desde que lo compras
              </Row>
              <Row label="Clases válidas">
                {classesText(selected.any_class, selected.classes)}
              </Row>
              <Row label="Tipo de clase">
                {kindText(selected.permanent_only)}
              </Row>
            </dl>

            <div className="flex gap-3">
              <button onClick={close} className={secondaryBtn}>
                Cerrar
              </button>
              <button onClick={startPurchase} className={primaryBtn}>
                Comprar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmacion de compra: precio, duracion y clases validas */}
      {selected && confirming && (
        <div className={overlay}>
          <div className="bg-white rounded-2xl p-8 w-full max-w-sm max-h-[90vh] overflow-y-auto flex flex-col gap-4 text-center">
            <p className="font-semibold text-slate-800">Confirmar compra</p>
            <p className="text-sm text-slate-500 -mt-2">
              {selected.name} · {selected.studio_name}
            </p>

            <div className="text-sm text-left border border-line rounded-xl divide-y divide-line">
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-slate-600">Paquete</span>
                <span className="text-slate-800">${money(base)}</span>
              </div>
              {fee !== null && (
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-slate-600">
                    Cargo por servicio ({feePercent}%)
                  </span>
                  <span className="text-slate-800">${money(fee)}</span>
                </div>
              )}
              <div className="flex justify-between px-4 py-2.5 font-semibold">
                <span className="text-slate-800">Total</span>
                <span className="text-slate-800">
                  ${money(base + (fee ?? 0))} MXN
                </span>
              </div>
            </div>

            <dl className="text-sm text-left flex flex-col gap-3">
              <Row label="Duración">
                {validityLabel(selected.validity_value, selected.validity_unit)}{" "}
                desde hoy, para usar {selected.class_count}{" "}
                {selected.class_count === 1 ? "clase" : "clases"}
              </Row>
              <Row label="Clases válidas">
                {classesText(selected.any_class, selected.classes)}
              </Row>
              <Row label="Tipo de clase">
                {kindText(selected.permanent_only)}
              </Row>
            </dl>

            <p className="text-xs text-slate-400">
              {isDemo
                ? "Cuenta demo: la compra se confirma sin ningún cobro."
                : "Se cobrará a tu tarjeta guardada al confirmar."}
            </p>

            {buyError && <p className="text-sm text-red-500">{buyError}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setConfirming(false)}
                disabled={buying}
                className={secondaryBtn}
              >
                Volver
              </button>
              <button
                onClick={handleBuy}
                disabled={buying}
                className={primaryBtn}
              >
                {buying ? "Procesando..." : "Pagar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sin tarjeta guardada */}
      {needsCard && (
        <div className={overlay}>
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full flex flex-col gap-4 text-center">
            <p className="font-semibold text-slate-800">
              Para comprar un paquete debes agregar una tarjeta
            </p>
            <p className="text-sm text-slate-600">¿Quieres agregarla ahora?</p>
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => setNeedsCard(false)}
                className={secondaryBtn}
              >
                Más tarde
              </button>
              <button
                onClick={() => navigate("/agregar-tarjeta")}
                className={primaryBtn}
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compra exitosa */}
      {bought && (
        <div className={overlay}>
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full flex flex-col gap-3 text-center">
            <p className="font-semibold text-slate-800 text-lg">
              ¡Listo! Ya tienes tu paquete
            </p>
            <p className="text-sm text-slate-600">
              «{bought.name}» vence el {formatDateTime(bought.expiresAt)}. Lo
              verás en Mis paquetes y podrás usarlo al reservar una clase.
            </p>
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => navigate("/mis-paquetes")}
                className={secondaryBtn}
              >
                Mis paquetes
              </button>
              <button onClick={() => setBought(null)} className={primaryBtn}>
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StudioPackages;
