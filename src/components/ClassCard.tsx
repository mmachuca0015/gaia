import { Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api, ApiError, getCachedUser } from "../lib/api";
import { fetchServiceFeePercent, serviceFeeCents } from "../lib/fees";
import {
  fetchUsablePurchases,
  money,
  redeemPackage,
  type UsablePurchase,
} from "../lib/packages";
type ClassCardProps = {
  hour: string;
  /** Hora de fin. Los horarios viejos no la tienen: duraban una hora. */
  endHour: string | null;
  name: string;
  instructor: string;
  availablePlaces: number;
  price: number;
  schedule_id: number;
  onReservaExitosa: () => void;
  classDate: string;
  alreadyBooked: boolean;
};

function ClassCard({
  hour,
  endHour,
  name,
  instructor,
  availablePlaces,
  price,
  schedule_id,
  onReservaExitosa,
  classDate,
  alreadyBooked,
}: ClassCardProps) {
  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":");
    const h = parseInt(hours as string);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return { time: `${h12}:${minutes}`, ampm };
  };

  const { time: formattedTime, ampm } = formatTime(hour);

  // "10 AM", "10:30 AM". En punto se omiten los minutos, que no dicen nada.
  const shortTime = (time: string) => {
    const { time: t, ampm: p } = formatTime(time);
    return `${t.endsWith(":00") ? t.slice(0, -3) : t} ${p}`;
  };

  // Sin hora de fin (horarios de antes de que el dueño la pudiera elegir) se
  // supone una hora, que es lo que duraban.
  const endsAt =
    endHour ??
    (() => {
      const [h, m] = hour.split(":").map(Number);
      return `${String(((h ?? 0) + 1) % 24).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}`;
    })();
  const range = `de ${shortTime(hour)} a ${shortTime(endsAt)}`;

  //Popup para verificar si tiene tarjeta agregada
  const [showPopup, setShowPopup] = useState(false);

  //Pop up para confirmar pago
  const [showConfirmPopUp, setShowConfirmPopUp] = useState(false);
  const navigate = useNavigate();

  // Cargo por servicio. El porcentaje se pide al backend para que lo que se
  // muestra aqui sea lo mismo que se va a cobrar.
  const [feePercent, setFeePercent] = useState<number | null>(null);
  useEffect(() => {
    fetchServiceFeePercent()
      .then(setFeePercent)
      .catch(() => setFeePercent(null));
  }, []);

  const classCents = Math.round(Number(price) * 100);
  const feeCents =
    feePercent !== null ? serviceFeeCents(classCents, feePercent) : null;
  const fee = (feeCents ?? 0) / 100;
  const total = (classCents + (feeCents ?? 0)) / 100;

  // Las cuentas demo reservan sin tarjeta: el backend no les cobra.
  const isDemo = getCachedUser()?.is_demo === true;

  // Paquetes del alumno que cubren esta clase. Si hay, se ofrecen antes que
  // la tarjeta; `payWith` es el id de la compra elegida o "card".
  const [usable, setUsable] = useState<UsablePurchase[]>([]);
  const [payWith, setPayWith] = useState<number | "card">("card");

  const handleReservar = async () => {
    const options = await fetchUsablePurchases(schedule_id, classDate).catch(
      () => [] as UsablePurchase[],
    );
    setUsable(options);
    setPayWith(options[0]?.id ?? "card");

    // Con un paquete no hace falta tarjeta. Con una clase a favor sí, si la
    // clase elegida cuesta más que la que se quedó sin sede: esa diferencia se
    // cobra.
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const todasCubren = options.some((o) => o.difference_cents === 0);
    if (options.length === 0 && !isDemo && !user.stripe_customer_id) {
      setShowPopup(true);
    } else if (options.length > 0 && !todasCubren && !isDemo && !user.stripe_customer_id) {
      setShowPopup(true);
    } else {
      setShowConfirmPopUp(true);
    }
  };

  const handleConfirmar = async () => {
    if (payWith === "card") return handlePagar();
    try {
      const res = await redeemPackage(payWith, schedule_id, classDate);
      setShowConfirmPopUp(false);
      const elegida = usable.find((u) => u.id === payWith);
      alert(
        elegida?.is_credit
          ? res.charged_cents > 0
            ? `¡Reserva confirmada! Usamos tu clase a favor y cobramos $${money(res.charged_cents)} MXN de diferencia.`
            : "¡Reserva confirmada! Usamos tu clase a favor, sin ningún cobro."
          : `¡Reserva confirmada! Te ${
              res.remaining === 1 ? "queda 1 clase" : `quedan ${res.remaining} clases`
            } en el paquete.`,
      );
      onReservaExitosa();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No pudimos hacer la reserva");
    }
  };

  //Función que realiza el pago
  const handlePagar = async () => {
    const res = await api("/payments/charge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: schedule_id,
        classDate: classDate,
      }),
    });

    const data = await res.json();
    if (res.ok) {
      setShowConfirmPopUp(false);
      alert("¡Reserva confirmada!");
      onReservaExitosa();
    } else {
      alert(data.error);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-5 flex items-center gap-4 shadow-sm">
      {/* Hora */}
      <div className="min-w-[52px] text-center">
        <p
          className="text-4xl font-semibold text-slate-800"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          {formattedTime}
        </p>
        <p className="text-md font-semibold text-slate-800">{ampm}</p>
      </div>

      {/* Divisor */}
      <div className="w-px h-16 bg-slate-100" />

      {/* Info */}
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <p className="font-semibold text-2xl text-slate-800">{name}</p>
        </div>
        <p className="text-md text-slate-600 mb-1">
          con {instructor} · {range}
        </p>
        <div className="flex items-center gap-3 text-md text-slate-600">
          <div className="flex items-center gap-1">
            {availablePlaces === 0 ? (
              <span className="text-red-400 font-medium text-sm">Lleno</span>
            ) : (
              <div className="flex items-center gap-1">
                <Users size={14} />
                <span>{availablePlaces} lugares restantes</span>
              </div>
            )}
          </div>
          <span className="font-medium bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full">
            ${price}
          </span>
        </div>
      </div>

      {/* Botón */}
      <button
        onClick={handleReservar}
        disabled={availablePlaces === 0 || alreadyBooked}
        className={`... ${availablePlaces === 0 || alreadyBooked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        {availablePlaces === 0
          ? "Lleno"
          : alreadyBooked
            ? "Ya reservaste"
            : "Reservar ahora"}
      </button>

      {/* Popup para agregar tarjeta */}
      {showPopup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 flex flex-col gap-4 text-center">
            <p className="font-semibold text-slate-800">
              Para reservar una clase debes agregar una tarjeta
            </p>
            <p className="text-sm text-slate-600">¿Quieres agregarla ahora?</p>
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => setShowPopup(false)}
                className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Más tarde
              </button>
              <button
                onClick={() => navigate("/agregar-tarjeta")}
                className="flex-1 bg-[#1b2c44] text-white py-2.5 rounded-xl text-sm hover:bg-[#33506f] transition-colors cursor-pointer"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {/*Popup para confirmar pago*/}
      {showConfirmPopUp && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 flex flex-col gap-4 text-center">
            <p className="font-semibold text-slate-800">Confirmar reserva</p>

            {/* Paquetes que cubren esta clase, o pagar con tarjeta */}
            {usable.length > 0 && (
              <div className="text-sm text-left border border-slate-200 rounded-xl divide-y divide-slate-100">
                {usable.map((u) => (
                  <label
                    key={u.id}
                    className="flex items-center gap-3 px-4 py-2.5 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name={`pay-${schedule_id}`}
                      checked={payWith === u.id}
                      onChange={() => setPayWith(u.id)}
                      className="accent-ink w-4 h-4"
                    />
                    <span className="text-slate-700">
                      {u.is_credit ? "Usar tu clase a favor" : `Usar «${u.name}»`}
                      <span className="block text-xs text-slate-400">
                        {u.is_credit ? (
                          <>
                            «{u.name}», pagaste ${money(u.value_cents)}
                            {u.difference_cents > 0 && (
                              <span className="block text-ink font-medium">
                                Esta clase cuesta más: pagas $
                                {money(u.difference_cents)} de diferencia
                              </span>
                            )}
                          </>
                        ) : u.remaining === 1 ? (
                          "Te queda 1 clase"
                        ) : (
                          `Te quedan ${u.remaining} clases`
                        )}
                      </span>
                    </span>
                  </label>
                ))}
                <label className="flex items-center gap-3 px-4 py-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name={`pay-${schedule_id}`}
                    checked={payWith === "card"}
                    onChange={() => setPayWith("card")}
                    className="accent-ink w-4 h-4"
                  />
                  <span className="text-slate-700">Pagar con tarjeta</span>
                </label>
              </div>
            )}

            {/* Desglose completo: el cargo por transaccion no puede aparecer
                por sorpresa hasta el estado de cuenta. */}
            {payWith === "card" && (
            <div className="text-sm text-left border border-slate-200 rounded-xl divide-y divide-slate-100">
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-slate-600">Clase</span>
                <span className="text-slate-800">${Number(price).toFixed(2)}</span>
              </div>
              {feeCents !== null && (
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-slate-600">
                    Cargo por servicio ({feePercent}%)
                  </span>
                  <span className="text-slate-800">${fee.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between px-4 py-2.5 font-semibold">
                <span className="text-slate-800">Total</span>
                <span className="text-slate-800">
                  ${(feeCents !== null ? total : Number(price)).toFixed(2)} MXN
                </span>
              </div>
            </div>
            )}

            {/* Una clase a favor con diferencia SÍ cobra. Decir "sin ningún
                cobro" ahí sería mentirle al alumno justo antes del cargo. */}
            {(() => {
              const elegida =
                payWith === "card" ? null : usable.find((u) => u.id === payWith);
              const diferencia = elegida?.difference_cents ?? 0;
              return (
                <p className="text-xs text-slate-400">
                  {payWith !== "card"
                    ? diferencia > 0
                      ? isDemo
                        ? "Cuenta demo: la reserva se confirma sin ningún cobro."
                        : `Se cobrará a tu tarjeta la diferencia de $${money(diferencia)} MXN más el cargo por servicio.`
                      : elegida?.is_credit
                        ? "Se usa tu clase a favor, sin ningún cobro."
                        : "Se descuenta 1 clase de tu paquete, sin ningún cobro."
                    : isDemo
                      ? "Cuenta demo: la reserva se confirma sin ningún cobro."
                      : "Se cobrará a tu tarjeta guardada al confirmar."}
                </p>
              );
            })()}
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => setShowConfirmPopUp(false)}
                className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmar}
                className="flex-1 bg-[#1b2c44] text-white py-2.5 rounded-xl text-sm hover:bg-[#33506f] transition-colors cursor-pointer"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ClassCard;
