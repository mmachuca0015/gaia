import { useState, useEffect } from "react";
import BookingsCard from "../../components/BookingsCard";
import { CalendarDays, Astroid } from "lucide-react";

import { api } from "../../lib/api";
function MisClases() {
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

  useEffect(() => {
    api("/bookings")
      .then((res) => res.json())
      .then((data) => setBookings(data));
  }, []);

  const tabs = ["Próximas", "Pasadas"];
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
