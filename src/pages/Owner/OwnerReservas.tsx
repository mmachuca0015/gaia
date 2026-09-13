import { useState, useEffect } from "react";
import { CalendarCheck } from "lucide-react";

import { api } from "../../lib/api";
function OwnerReservas() {
  type Studio = {
    id: number;
  };
  const owner = JSON.parse(localStorage.getItem("user") || "{}");

  const [studio, setStudio] = useState<Studio | null>(null);
  const [reservations, setReservations] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"proximas" | "pasadas">(
    "proximas",
  );
  const [showDetails, setShowDetails] = useState(false);
  const [selectedReserva, setSelectedReserva] = useState<any | null>(null);
  const [reservaUsers, setReservaUsers] = useState<any[]>([]);

  useEffect(() => {
    api(`/studios/owner/${owner.id}`)
      .then((res) => res.json())
      .then((data) => {
        setStudio(data);
      });
  }, []);

  useEffect(() => {
    if (!studio?.id) return;
    api(`/studios/${studio.id}/reservas?type=${activeTab}`)
      .then((res) => res.json())
      .then((data) => setReservations(data));
  }, [studio, activeTab]);

  const handleShowDetails = async (reserva: any) => {
    setSelectedReserva(reserva);
    const res = await api(
      `/studios/${studio?.id}/reservas/${reserva.schedule_id}/usuarios?classDate=${reserva.class_date}`,
    );
    const data = await res.json();
    setReservaUsers(data);
    setShowDetails(true);
  };

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1
          className="text-4xl md:text-6xl font-semibold text-stone-800"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Mis{" "}
          <span
            className="italic text-[#3a5a3a]"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            Reservas
          </span>
        </h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(["proximas", "pasadas"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-full text-md transition-colors cursor-pointer ${
              activeTab === tab
                ? "bg-[#3a5a3a] text-white"
                : "bg-white text-stone-600 border border-stone-200 hover:border-stone-400"
            }`}
          >
            {tab === "proximas" ? "Próximas" : "Pasadas"}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-4 mx-auto max-w-2xl">
        {reservations.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 flex flex-col items-center gap-4 text-center">
            <CalendarCheck size={36} className="text-stone-300" />
            <p className="text-stone-600 font-medium">
              Sin reservas {activeTab === "proximas" ? "próximas" : "pasadas"}
            </p>
          </div>
        ) : (
          reservations.map((reserva, index) => (
            <div key={index} className="bg-white rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-stone-800">
                    {reserva.class_name}
                  </p>
                  <p className="text-md text-stone-600">
                    con {reserva.instructor}
                  </p>
                </div>
                <button
                  className="text-md text-[#3a5a3a] font-medium cursor-pointer hover:underline"
                  onClick={() => handleShowDetails(reserva)}
                >
                  Detalles
                </button>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-md text-stone-600">
                  {new Date(reserva.class_date).toLocaleDateString("es-MX", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}{" "}
                  · {reserva.time.slice(0, 5)}
                </p>
                <span
                  className={`text-md px-3 py-1 rounded-full ${
                    reserva.available_spots === 0
                      ? "bg-amber-50 text-amber-700"
                      : "bg-[#e8f0e8] text-[#3a5a3a]"
                  }`}
                >
                  {reserva.reservas_count}/{reserva.capacity} inscritos
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {showDetails && selectedReserva && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md mx-4 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-4">
              <div>
                <p className="font-semibold text-stone-800">
                  {selectedReserva.class_name}
                </p>
                <p className="text-md text-stone-600">
                  {new Date(selectedReserva.class_date).toLocaleDateString(
                    "es-MX",
                    {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    },
                  )}{" "}
                  · {selectedReserva.time.slice(0, 5)}
                </p>
              </div>
              <span className="text-md bg-[#e8f0e8] text-[#3a5a3a] px-3 py-1 rounded-full">
                {selectedReserva.reservas_count}/{selectedReserva.capacity}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {reservaUsers.length === 0 ? (
                <p className="text-md text-stone-400 text-center">
                  Sin usuarios inscritos
                </p>
              ) : (
                reservaUsers.map((user, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 py-2 border-b border-stone-100 last:border-0"
                  >
                    <div className="w-10 h-10 rounded-full bg-stone-200 flex items-center justify-center text-stone-600 font-medium flex-shrink-0">
                      {user.name.charAt(0)}
                      {user.last_name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-stone-800">
                        {user.name} {user.last_name}
                      </p>
                      <p className="text-md text-stone-600">{user.email}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => setShowDetails(false)}
              className="w-full border border-stone-200 text-stone-600 py-2.5 rounded-xl text-md hover:bg-stone-50 transition-colors cursor-pointer mt-2"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default OwnerReservas;
