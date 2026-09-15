import { useEffect, useState } from "react";
import { Ticket, Plus, Copy, Check } from "lucide-react";

import {
  fetchCoupons,
  createCoupon,
  etiquetaDuracion,
  DURACIONES,
  PORCENTAJES,
  type Coupon,
} from "../../lib/coupons";

/* Cupones de cortesia.
   Se generan para cerrar estudios a mano ("por ser de los primeros, te regalo
   el primer mes"). Son de un solo uso y se canjean en el registro. */

// El color de fondo del panel. Los recortes del ticket son circulos pintados
// de este color encima de la tarjeta: es lo que da la ilusion de papel
// troquelado sin recortar nada de verdad.
const FONDO = "#f4f7fa";

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function CouponTicket({ coupon }: { coupon: Coupon }) {
  const [copiado, setCopiado] = useState(false);
  const usado = coupon.redeemed_at !== null;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(coupon.code);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Sin permiso de portapapeles no pasa nada: el codigo esta a la vista
      // y se puede seleccionar a mano.
    }
  };

  return (
    <div
      className={`relative flex rounded-2xl overflow-hidden transition-opacity ${
        usado ? "opacity-55" : ""
      }`}
    >
      {/* Talon: el descuento y por cuanto tiempo */}
      <div className="w-36 shrink-0 bg-[#1b2c44] text-white flex flex-col items-center justify-center py-6 px-3">
        <p
          className="text-4xl font-semibold leading-none"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          {coupon.percent_off}%
        </p>
        <p className="text-[11px] tracking-[0.18em] uppercase mt-2 text-white/60">
          de descuento
        </p>
        <p className="text-sm mt-3 text-white/90">
          {etiquetaDuracion(coupon.duration_months)}
        </p>
      </div>

      {/* Troquelado: una franja blanca con la linea punteada al centro y los
          dos recortes mordiendola por arriba y por abajo. La franja necesita
          ancho propio: pegada al borde del talon, el punteado se perdia contra
          el azul marino. */}
      <div className="relative w-3 shrink-0 bg-white">
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 border-l-2 border-dashed border-slate-200" />
        <div
          className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full"
          style={{ backgroundColor: FONDO }}
        />
        <div
          className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full"
          style={{ backgroundColor: FONDO }}
        />
      </div>

      {/* Cuerpo: el codigo y su estado */}
      <div className="flex-1 bg-white py-5 px-6 flex flex-col justify-center min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] tracking-[0.18em] uppercase text-slate-400 mb-1">
              Código
            </p>
            <button
              onClick={copiar}
              title="Copiar código"
              className="flex items-center gap-2 font-mono text-lg text-slate-800 hover:text-[#1b2c44] transition-colors cursor-pointer group"
            >
              <span className="truncate">{coupon.code}</span>
              {copiado ? (
                <Check size={14} className="text-emerald-600 shrink-0" />
              ) : (
                <Copy
                  size={14}
                  className="text-slate-300 group-hover:text-slate-500 shrink-0"
                />
              )}
            </button>
          </div>

          <span
            className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium ${
              usado
                ? "bg-slate-100 text-slate-500"
                : "bg-[#e8eef7] text-[#1b2c44]"
            }`}
          >
            {usado ? "Usado" : "Disponible"}
          </span>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-400">
          {usado ? (
            <>
              Canjeado el {fechaCorta(coupon.redeemed_at!)}
              {coupon.redeemed_by_studio && (
                <>
                  {" "}
                  por{" "}
                  <span className="text-slate-600">
                    {coupon.redeemed_by_studio}
                  </span>
                </>
              )}
            </>
          ) : (
            <>Creado el {fechaCorta(coupon.created_at)}</>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminCupones() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [percentOff, setPercentOff] = useState(50);
  const [durationMonths, setDurationMonths] = useState(1);
  const [creando, setCreando] = useState(false);

  // La carga vive dentro del efecto: no se usa en ningun otro sitio, y tenerla
  // fuera hacia que el efecto llamara a setState de forma sincrona.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchCoupons();
        if (cancelled) return;
        setCoupons(data);
        setError("");
      } catch {
        if (!cancelled) setError("No pudimos cargar los cupones");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const generar = async () => {
    setCreando(true);
    try {
      const nuevo = await createCoupon(percentOff, durationMonths);
      // Se antepone en vez de recargar: el cupon recien creado tiene que
      // quedar a la vista para poder copiarlo de inmediato.
      setCoupons((previos) => [nuevo, ...previos]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "No pudimos crear el cupón");
    } finally {
      setCreando(false);
    }
  };

  const disponibles = coupons.filter((c) => !c.redeemed_at).length;

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1
          className="text-4xl md:text-6xl font-semibold text-slate-800"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Cupones{" "}
          <span
            className="text-[#1b2c44]"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            de cortesía
          </span>
        </h1>
        <p className="text-slate-600 mt-2">
          Cada cupón sirve una sola vez. El estudio lo escribe al registrarse y
          el descuento se aplica a su suscripción.
        </p>
      </div>

      {/* Generador */}
      <div className="bg-white rounded-2xl p-6 mb-8">
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <div className="flex-1">
            <label className="text-xs text-slate-400 block mb-1.5">
              Descuento
            </label>
            <select
              value={percentOff}
              onChange={(e) => setPercentOff(Number(e.target.value))}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 transition-colors cursor-pointer"
            >
              {PORCENTAJES.map((p) => (
                <option key={p} value={p}>
                  {p}%
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1">
            <label className="text-xs text-slate-400 block mb-1.5">
              Duración
            </label>
            <select
              value={durationMonths}
              onChange={(e) => setDurationMonths(Number(e.target.value))}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 transition-colors cursor-pointer"
            >
              {DURACIONES.map((m) => (
                <option key={m} value={m}>
                  {etiquetaDuracion(m)}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={generar}
            disabled={creando}
            className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-[#1b2c44] text-white text-sm font-medium hover:bg-[#33506f] transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Plus size={16} />
            {creando ? "Generando..." : "Generar cupón"}
          </button>
        </div>

        {/* Los cupones cortos no cubren un cobro anual completo, y Stripe
            descontaria la factura entera del año. El backend los rechaza al
            canjearlos; se avisa aqui para que no sea una sorpresa. */}
        {durationMonths < 12 && (
          <p className="text-xs text-slate-400 mt-4">
            Un cupón de {etiquetaDuracion(durationMonths)} solo aplica al plan
            mensual. Para el plan anual usa uno de 1 año o 2 años.
          </p>
        )}
      </div>

      {/* Listado */}
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-sm font-medium text-slate-600">Últimos 3 meses</h2>
        {!loading && coupons.length > 0 && (
          <p className="text-xs text-slate-400">
            {disponibles} de {coupons.length} sin usar
          </p>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl p-10 text-center text-slate-500">
          Cargando...
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl p-10 text-center text-slate-500">
          {error}
        </div>
      ) : coupons.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 flex flex-col items-center gap-4 text-center">
          <Ticket size={36} className="text-slate-300" />
          <p className="text-slate-600 font-medium">
            No has generado cupones todavía
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {coupons.map((coupon) => (
            <CouponTicket key={coupon.id} coupon={coupon} />
          ))}
        </div>
      )}
    </div>
  );
}

export default AdminCupones;
