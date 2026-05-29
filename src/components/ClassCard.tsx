import { Users } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

type ClassCardProps = {
  hour: string;
  name: string;
  instructor: string;
  availablePlaces: number;
  price: number;
  schedule_id: number;
  onReservaExitosa: () => void;
};

function ClassCard({
  hour,
  name,
  instructor,
  availablePlaces,
  price,
  schedule_id,
  onReservaExitosa,
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
    const user = JSON.parse(localStorage.getItem("user") || "{}");

    const res = await fetch("http://localhost:3001/payments/charge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        scheduleId: schedule_id,
        amount: price,
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
          className="text-4xl font-semibold text-stone-800"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          {formattedTime}
        </p>
        <p className="text-md font-semibold text-stone-800">{ampm}</p>
      </div>

      {/* Divisor */}
      <div className="w-px h-16 bg-stone-100" />

      {/* Info */}
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <p className="font-semibold text-2xl text-stone-800">{name}</p>
        </div>
        <p className="text-md text-stone-600 mb-1">con {instructor}</p>
        <div className="flex items-center gap-3 text-md text-stone-600">
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
          <span className="font-medium bg-stone-200 text-stone-500 px-2 py-0.5 rounded-full">
            ${price}
          </span>
        </div>
      </div>

      {/* Botón */}
      <button
        onClick={handleReservar}
        disabled={availablePlaces === 0}
        className="bg-[#3a5a3a] text-white text-md px-4 py-2.5 rounded-xl hover:bg-[#2e4a2e] transition-colors cursor-pointer whitespace-nowrap"
      >
        {availablePlaces === 0 ? "Lleno" : "Reservar ahora"}
      </button>

      {/* Popup para agregar tarjeta */}
      {showPopup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 flex flex-col gap-4 text-center">
            <p className="font-semibold text-stone-800">
              Para reservar una clase debes agregar una tarjeta
            </p>
            <p className="text-sm text-stone-600">¿Quieres agregarla ahora?</p>
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => setShowPopup(false)}
                className="flex-1 border border-stone-200 text-stone-600 py-2.5 rounded-xl text-sm hover:bg-stone-50 transition-colors cursor-pointer"
              >
                Más tarde
              </button>
              <button
                onClick={() => navigate("/agregar-tarjeta")}
                className="flex-1 bg-[#3a5a3a] text-white py-2.5 rounded-xl text-sm hover:bg-[#2e4a2e] transition-colors cursor-pointer"
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
            <p className="font-semibold text-stone-800">Confirmar reserva</p>
            <p className="text-sm text-stone-600">
              Si das click en aceptar confirmas el pago de{" "}
              <span className="font-semibold text-stone-800">${price}</span>{" "}
              para reservar tu lugar en la clase.
            </p>
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => setShowConfirmPopUp(false)}
                className="flex-1 border border-stone-200 text-stone-600 py-2.5 rounded-xl text-sm hover:bg-stone-50 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handlePagar}
                className="flex-1 bg-[#3a5a3a] text-white py-2.5 rounded-xl text-sm hover:bg-[#2e4a2e] transition-colors cursor-pointer"
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
