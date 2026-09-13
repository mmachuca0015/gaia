import { useEffect, useState } from "react";
import { Star, BadgeCheck, CalendarCheck, Heart } from "lucide-react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from "chart.js";

import { api } from "../../lib/api";
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
);

function PanelControl() {
  const owner = JSON.parse(localStorage.getItem("user") || "{}");

  type Studio = {
    id: number;
    name: string;
  };

  const [studio, setStudio] = useState<Studio | null>(null);
  useEffect(() => {
    api(`/studios/owner/${owner.id}`)
      .then((res) => res.json())
      .then((data) => setStudio(data));
  }, []);

  const [ingresos, setIngresos] = useState({ total: 0, reservas: 0 });
  const [activeFilter, setActiveFilter] = useState<
    "hoy" | "semana" | "mes" | "semestral"
  >("hoy");

  useEffect(() => {
    if (!studio?.id) return;
    api(`/studios/${studio.id}/ingresos?period=${activeFilter}`)
      .then((res) => res.json())
      .then((data) => setIngresos(data));
  }, [studio, activeFilter]);

  const [graficaData, setGraficaData] = useState<
    { periodo: string; total: number }[]
  >([]);

  useEffect(() => {
    if (!studio?.id) return;
    api(`/studios/${studio.id}/ingresos-grafica?period=${activeFilter}`)
      .then((res) => res.json())
      .then((data) => setGraficaData(data));
  }, [studio, activeFilter]);

  //Obtener clases del día de hoy
  type TodayClass = {
    class_id: number;
    schedule_id: number;
    name: string;
    instructor: string;
    price: number;
    time: string;
    available_spots: number;
    capacity: number;
  };

  const [todayClasses, setTodayClasses] = useState<TodayClass[]>([]);

  useEffect(() => {
    if (!studio) return;
    api(`/studios/${studio.id}/clases-hoy`)
      .then((res) => res.json())
      .then((data) => {
        console.log(studio);
        setTodayClasses(data);
      });
    console.log(studio);
  }, [studio]);

  const [actividad, setActividad] = useState<any[]>([]);

  useEffect(() => {
    if (!studio?.id) return;
    api(`/studios/${studio.id}/actividad-reciente`)
      .then((res) => res.json())
      .then((data) => setActividad(data));
  }, [studio]);

  return (
    <div>
      <div className="p-4 md:p-8">
        <div className="mb-8">
          <h1
            className="text-4xl md:text-6xl font-semibold text-slate-800"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            Hola,{" "}
            <span
              className="text-[#1b2c44]"
              style={{ fontFamily: "Cormorant Garamond, serif" }}
            >
              {studio?.name}
            </span>
          </h1>
        </div>

        {/* Layout de dos columnas */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_450px] gap-4">
          {/* Columna izquierda */}
          <div className="flex flex-col gap-4">
            {/* Ingresos y clases de hoy, calificación*/}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl p-5 text-center">
                <p className="text-xl text-slate-600 mb-1">Ingresos hoy</p>
                <p
                  className="text-5xl font-semibold text-slate-800"
                  style={{ fontFamily: "Cormorant Garamond, serif" }}
                >
                  ${Number(ingresos.total || 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-white rounded-2xl p-5 text-center">
                <p className="text-xl text-slate-600 mb-1">Clases hoy</p>
                <p
                  className="text-5xl font-semibold text-slate-800"
                  style={{ fontFamily: "Cormorant Garamond, serif" }}
                >
                  {todayClasses.length}
                </p>
                <p className="text-md text-slate-600 mt-3">
                  {todayClasses.filter((c) => c.available_spots > 0).length} con
                  lugares disponibles
                </p>
              </div>
              {/* <div className="bg-white rounded-2xl p-5 text-center">
                <p className="text-xl text-slate-600 mb-1">Calificación</p>
                <div className="flex justify-center items-center gap-2">
                  <p
                    className="text-5xl font-semibold text-slate-800"
                    style={{ fontFamily: "Cormorant Garamond, serif" }}
                  >
                    4.9
                  </p>
                  <Star size={25} className="text-[#1b2c44] fill-[#1b2c44]" />
                </div>
                <p className="text-md text-slate-600 mt-1">128 reseñas</p>
              </div> */}
            </div>
            {/* Ingresos */}
            <div className="bg-white rounded-2xl p-5">
              {/* Filtros */}
              <div className="flex items-center justify-between mb-4">
                <p className="font-semibold text-slate-800">Ingresos</p>
                <div className="flex gap-2">
                  {(["hoy", "semana", "mes", "semestral"] as const).map(
                    (filter) => (
                      <button
                        key={filter}
                        onClick={() => setActiveFilter(filter)}
                        className={`px-3 py-1 rounded-full text-md transition-colors cursor-pointer ${
                          activeFilter === filter
                            ? "bg-[#1b2c44] text-white"
                            : "border border-slate-200 text-slate-600 hover:border-slate-400"
                        }`}
                      >
                        {filter === "hoy"
                          ? "Hoy"
                          : filter === "semana"
                            ? "7 días"
                            : filter === "mes"
                              ? "1 mes"
                              : "6 meses"}
                      </button>
                    ),
                  )}
                </div>
              </div>

              {/* Total */}
              <div className="mb-4">
                <p className="text-md text-slate-600">Total del período</p>
                <p
                  className="text-5xl font-semibold text-slate-800"
                  style={{ fontFamily: "Cormorant Garamond, serif" }}
                >
                  ${Number(ingresos.total || 0).toLocaleString()}
                </p>
              </div>

              {/* Gráfica */}
              <div style={{ height: "300px", width: "100%" }}>
                <Line
                  data={{
                    labels: graficaData.map((d) => String(d.periodo)),
                    datasets: [
                      {
                        data: graficaData.map((d) => Number(d.total)),
                        borderColor: "#1b2c44",
                        backgroundColor: "rgba(58,90,58,0.08)",
                        fill: true,
                        tension: 0.4,
                        pointRadius: 3,
                        pointBackgroundColor: "#1b2c44",
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                    },
                    scales: {
                      y: {
                        display: false,
                        beginAtZero: true,
                      },
                      x: {
                        display: false,
                        grid: { display: false },
                        offset: false, // importante
                      },
                    },
                    layout: {
                      padding: 0,
                    },
                    elements: {
                      point: {
                        radius: 3,
                      },
                    },
                  }}
                />
              </div>
            </div>

            {/* Clases de hoy */}
            <div className="bg-white rounded-2xl p-5">
              <p className="font-semibold text-slate-800 mb-4">Clases de hoy</p>
              <div className="flex flex-col gap-3">
                {todayClasses.map((clase) => (
                  <div
                    key={clase.schedule_id}
                    className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0"
                  >
                    <div className="flex items-center gap-4">
                      <p
                        className="text-2xl font-semibold text-slate-800"
                        style={{ fontFamily: "Cormorant Garamond, serif" }}
                      >
                        {clase.time.slice(0, 5)}
                      </p>
                      <div>
                        <p className="font-medium text-slate-800">
                          {clase.name}
                        </p>
                        <p className="text-md text-slate-600">
                          con {clase.instructor}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-md px-3 py-1 rounded-full ${
                        clase.available_spots === 0
                          ? "bg-amber-50 text-amber-700"
                          : "bg-[#e8eef7] text-[#1b2c44]"
                      }`}
                    >
                      {clase.available_spots === 0
                        ? "Lleno"
                        : `${clase.available_spots}/${clase.capacity} lugares`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Columna derecha */}
          <div className="bg-white rounded-2xl p-5 h-fit">
            <p className="font-semibold text-slate-800 border-b border-slate-100 pb-4 mb-4">
              Actividad reciente
            </p>
            <ul className="flex flex-col gap-4">
              {actividad.map((item, index) => (
                <li
                  key={index}
                  className="flex items-start gap-3 border-b border-slate-100 last:border-0 pb-4"
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      item.tipo === "reserva" ? "bg-[#e8eef7]" : "bg-[#faeeda]"
                    }`}
                  >
                    {item.tipo === "reserva" ? (
                      <CalendarCheck size={15} className="text-[#1b2c44]" />
                    ) : (
                      <Heart size={15} className="text-amber-700" />
                    )}
                  </div>
                  <div>
                    <p className="text-md text-slate-800">
                      <span className="font-medium">
                        {item.name} {item.last_name}
                      </span>
                      {item.tipo === "reserva"
                        ? ` reservó ${item.class_name}`
                        : ` agregó tu estudio a favoritos`}
                    </p>
                    <p className="text-md text-slate-400">
                      {new Date(item.created_at).toLocaleDateString("es-MX", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PanelControl;
