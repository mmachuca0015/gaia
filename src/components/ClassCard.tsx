import { Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../lib/api";
import { fetchTransactionFee } from "../lib/fees";
type ClassCardProps = {
  hour: string;
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

  //Popup para verificar si tiene tarjeta agregada
  const [showPopup, setShowPopup] = useState(false);

  //Pop up para confirmar pago
  const [showConfirmPopUp, setShowConfirmPopUp] = useState(false);
  const navigate = useNavigate();

  // Cuota fija por transaccion. Se pide al backend para que lo que se muestra
  // aqui sea lo mismo que se va a cobrar.
  const [feeCents, setFeeCents] = useState<number | null>(null);
  useEffect(() => {
    fetchTransactionFee()
      .then(setFeeCents)
      .catch(() => setFeeCents(null));
  }, []);

  const fee = (feeCents ?? 0) / 100;
  const total = Number(price) + fee;

  const handleReservar = () => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    if (!user.stripe_customer_id) {
      setShowPopup(true);
    } else {
      setShowConfirmPopUp(true);
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
        <p className="text-md text-slate-600 mb-1">con {instructor}</p>
        <div className="flex items-center gap-3 text-md text-slate-600">
          <div className="flex items-center gap-1">
            {availablePlaces === 0 ? (
              <span className="text-red-400 font-medium text-sm">Lleno</span>
            ) : (
              <div className="flex items-center gap-1">
                <Users size={14} />
                <span>{availablePlaces} lugares</span>
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

            {/* Desglose completo: el cargo por transaccion no puede aparecer
                por sorpresa hasta el estado de cuenta. */}
            <div className="text-sm text-left border border-slate-200 rounded-xl divide-y divide-slate-100">
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-slate-600">Clase</span>
                <span className="text-slate-800">${Number(price).toFixed(2)}</span>
              </div>
              {feeCents !== null && (
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-slate-600">Cargo por transacción</span>
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

            <p className="text-xs text-slate-400">
              Se cobrará a tu tarjeta guardada al confirmar.
            </p>
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => setShowConfirmPopUp(false)}
                className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handlePagar}
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
