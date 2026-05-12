import { useState, useEffect } from "react";
import BookingsCard from "../../components/BookingsCard";
import { CalendarDays, Astroid } from "lucide-react";

function MisClases() {
  const [bookings, setBookings] = useState([]);
  useEffect(() => {
    fetch("http://localhost:3001/bookings")
      .then((res) => res.json())
      .then((data) => setBookings(data));
  }, []);

  const tabs = ["Próximas", "Pasadas"];
  const [activeTab, setActiveTab] = useState("Próximas");

  return (
    <div className="p-4 md:p-8">
      <div>
        <h1
          className="text-4xl md:text-6xl font-semibold text-stone-800"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Mis{" "}
          <span
            className="italic text-[#3a5a3a]"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            Clases
          </span>
        </h1>
        <p className="text-base text-stone-600 mt-1">Tus próximas reservas</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mt-4">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-[#3a5a3a] text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
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
              <Astroid size={40} className="text-stone-600 mb-4" />
              <p className="text-stone-600 font-medium">Sin clases por aquí</p>
              <p className="text-stone-400 text-sm mt-1">
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
              <CalendarDays size={40} className="text-stone-600 mb-4" />
              <p className="text-stone-600 font-medium">Sin clases por aquí</p>
              <p className="text-stone-400 text-sm mt-1">
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
