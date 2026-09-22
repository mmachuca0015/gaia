import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import BookingsCard from "../../components/BookingsCard";
import { CalendarDays, Astroid, Ticket } from "lucide-react";

import { api } from "../../lib/api";
import {
  fetchMyPackages,
  formatDay,
  money,
  type PurchasedPackage,
} from "../../lib/packages";

function MisClases() {
  const navigate = useNavigate();
  type Booking = {
    status: string;
    studio_name: string;
    id: number;
    day: string;
    time: string;
    instructor: string;
    location: string;
  };
  const [bookings, setBookings] = useState<Booking[]>([]);

  // Lo que el alumno ya pago y todavia no usa: paquetes con clases restantes
  // y las clases a favor que le quedaron cuando cerro una sucursal. Van aqui
  // y no solo en "Mis paquetes" porque son clases pendientes de tomar, que es
  // lo que uno viene a buscar a esta pantalla.
  const [pending, setPending] = useState<PurchasedPackage[]>([]);

  useEffect(() => {
    api("/bookings")
      .then((res) => res.json())
      .then((data) => setBookings(data));
    fetchMyPackages()
      .then((data) => setPending(data.filter((p) => !p.expired && p.remaining > 0)))
      .catch(() => setPending([]));
  }, []);

  const tabs = ["Próximas", "Sin canjear", "Pasadas"];
  const [activeTab, setActiveTab] = useState("Próximas");

  return (
    <div className="p-4 md:p-8">
      <div>
        <h1
          className="text-4xl md:text-6xl font-semibold text-slate-800"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Mis{" "}
          <span
            className="text-[#1b2c44]"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            Clases
          </span>
        </h1>
        <p className="text-base text-slate-600 mt-1">Tus próximas reservas</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mt-4">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-[#1b2c44] text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-4 mt-8 max-w-2xl mx-auto">
        {activeTab === "Próximas" &&
          (bookings.filter((booking) => booking.status === "activa").length ===
          0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Astroid size={40} className="text-slate-600 mb-4" />
              <p className="text-slate-600 font-medium">Sin clases por aquí</p>
              <p className="text-slate-400 text-sm mt-1">
                Aquí podrás ver tus clases agendadas
              </p>
            </div>
          ) : (
            bookings
              .filter((booking) => booking.status === "activa")
              .map((booking) => (
                <div key={booking.id}>
                  <BookingsCard
                    studio_name={booking.studio_name}
                    instructor={booking.instructor}
                    day={booking.day}
                    time={booking.time}
                  />
                </div>
              ))
          ))}

        {activeTab === "Sin canjear" &&
          (pending.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Ticket size={40} className="text-slate-600 mb-4" />
              <p className="text-slate-600 font-medium">Nada pendiente</p>
              <p className="text-slate-400 text-sm mt-1">
                Aquí aparecen las clases que ya pagaste y todavía no usas
              </p>
            </div>
          ) : (
            pending.map((p) => (
              <div
                key={p.id}
                className="bg-white rounded-2xl border border-line px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex-1">
                  <p className="font-medium text-slate-800">{p.name}</p>
                  {p.is_credit ? (
                    /* Un abono por cierre: lo que importa es que no perdio su
                       dinero y cuanto vale, porque de ahi sale la diferencia
                       si canjea una clase mas cara. */
                    <p className="text-sm text-slate-500 mt-0.5">
                      Clase a favor
                      {p.origin_studio_name && <> por el cierre de {p.origin_studio_name}</>}
                      . Pagaste <strong>${money(p.price_cents)}</strong> y la puedes
                      usar en {p.studio_name}.
                    </p>
                  ) : (
                    <p className="text-sm text-slate-500 mt-0.5">
                      {p.remaining === 1
                        ? "Te queda 1 clase"
                        : `Te quedan ${p.remaining} clases`}{" "}
                      en {p.studio_name}.
                    </p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">
                    Vence el {formatDay(p.expires_at)}
                  </p>
                </div>
                <button
                  onClick={() => navigate(`/studios/${p.studio_id}`)}
                  className="shrink-0 px-5 py-2.5 rounded-full bg-[#1b2c44] text-white text-sm font-medium hover:bg-[#33506f] transition-colors cursor-pointer"
                >
                  {p.is_credit ? "Canjear clase" : "Reservar clase"}
                </button>
              </div>
            ))
          ))}

        {activeTab === "Pasadas" &&
          (bookings.filter((booking) => booking.status === "pasada").length ===
          0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CalendarDays size={40} className="text-slate-600 mb-4" />
              <p className="text-slate-600 font-medium">Sin clases por aquí</p>
              <p className="text-slate-400 text-sm mt-1">
                Aquí podrás ver el historial de tus clases agendadas
              </p>
            </div>
          ) : (
            bookings
              .filter((booking) => booking.status === "pasada")
              .map((booking) => (
                <div key={booking.id}>
                  <BookingsCard
                    studio_name={booking.studio_name}
                    instructor={booking.instructor}
                    day={booking.day}
                    time={booking.time}
                    isPast={true}
                  />
                </div>
              ))
          ))}
      </div>
    </div>
  );
}

export default MisClases;
