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
    fetch(`http://localhost:3001/studios/owner/${owner.id}`)
      .then((res) => res.json())
      .then((data) => {
        setStudio(data);
      });
  }, []);

  const [activeFilter, setActiveFilter] = useState<
    "hoy" | "semana" | "mes" | "semestral"
  >("hoy");
  const chartData = {
    hoy: {
      labels: ["8am", "10am", "12pm", "2pm", "4pm", "6pm"],
      data: [320, 320, 0, 0, 320, 320],
    },
    semana: {
      labels: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
      data: [960, 640, 1280, 320, 960, 1600, 480],
    },
    mes: {
      labels: ["S1", "S2", "S3", "S4"],
      data: [8960, 11200, 9600, 12800],
    },
    semestral: {
      labels: ["Ene", "Feb", "Mar", "Abr", "May", "Jun"],
      data: [32000, 28000, 38400, 41600, 35200, 44800],
    },
  };

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
    fetch(`http://localhost:3001/studios/${studio.id}/clases-hoy`)
      .then((res) => res.json())
      .then((data) => {
        console.log(studio);
        setTodayClasses(data);
      });
    console.log(studio);
  }, [studio]);

  return (
    <div>
      <div className="p-4 md:p-8">
        <div className="mb-8">
          <h1
            className="text-4xl md:text-6xl font-semibold text-stone-800"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            Hola,{" "}
            <span
              className="italic text-[#3a5a3a]"
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
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-2xl p-5 text-center">
                <p className="text-xl text-stone-600 mb-1">Ingresos hoy</p>
                <p
                  className="text-5xl font-semibold text-stone-800"
                  style={{ fontFamily: "Cormorant Garamond, serif" }}
                >
                  $1,280
                </p>
              </div>
              <div className="bg-white rounded-2xl p-5 text-center">
                <p className="text-xl text-stone-600 mb-1">Clases hoy</p>
                <p
                  className="text-5xl font-semibold text-stone-800"
                  style={{ fontFamily: "Cormorant Garamond, serif" }}
                >
                  3
                </p>
                <p className="text-md text-stone-600 mt-3">
                  2 con lugares disponibles
                </p>
              </div>
              <div className="bg-white rounded-2xl p-5 text-center">
                <p className="text-xl text-stone-600 mb-1">Calificación</p>
                <div className="flex justify-center items-center gap-2">
                  <p
                    className="text-5xl font-semibold text-stone-800"
                    style={{ fontFamily: "Cormorant Garamond, serif" }}
                  >
                    4.9
                  </p>
                  <Star size={25} className="text-[#3a5a3a] fill-[#3a5a3a]" />
                </div>
                <p className="text-md text-stone-600 mt-1">128 reseñas</p>
              </div>
            </div>
            {/* Ingresos */}
            <div className="bg-white rounded-2xl p-5">
              {/* Filtros */}
              <div className="flex items-center justify-between mb-4">
                <p className="font-semibold text-stone-800">Ingresos</p>
                <div className="flex gap-2">
                  {(["hoy", "semana", "mes", "semestral"] as const).map(
                    (filter) => (
                      <button
                        key={filter}
                        onClick={() => setActiveFilter(filter)}
                        className={`px-3 py-1 rounded-full text-md transition-colors cursor-pointer ${
                          activeFilter === filter
                            ? "bg-[#3a5a3a] text-white"
                            : "border border-stone-200 text-stone-600 hover:border-stone-400"
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
                <p className="text-md text-stone-600">Total del período</p>
                <p
                  className="text-5xl font-semibold text-stone-800"
                  style={{ fontFamily: "Cormorant Garamond, serif" }}
                >
                  $
                  {chartData[activeFilter].data
                    .reduce((a, b) => a + b, 0)
                    .toLocaleString()}
                </p>
              </div>

              {/* Gráfica */}
              <div style={{ height: "300px", width: "100%" }}>
                <Line
                  data={{
                    labels: chartData[activeFilter].labels,
                    datasets: [
                      {
                        data: chartData[activeFilter].data,
                        borderColor: "#3a5a3a",
                        backgroundColor: "rgba(58,90,58,0.08)",
                        fill: true,
                        tension: 0.4,
                        pointRadius: 3,
                        pointBackgroundColor: "#3a5a3a",
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
              <p className="font-semibold text-stone-800 mb-4">Clases de hoy</p>
              <div className="flex flex-col gap-3">
                {todayClasses.map((clase) => (
                  <div
                    key={clase.schedule_id}
                    className="flex items-center justify-between py-3 border-b border-stone-100 last:border-0"
                  >
                    <div className="flex items-center gap-4">
                      <p
                        className="text-2xl font-semibold text-stone-800"
                        style={{ fontFamily: "Cormorant Garamond, serif" }}
                      >
                        {clase.time.slice(0, 5)}
                      </p>
                      <div>
                        <p className="font-medium text-stone-800">
                          {clase.name}
                        </p>
                        <p className="text-md text-stone-600">
                          con {clase.instructor}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-md px-3 py-1 rounded-full ${
                        clase.available_spots === 0
                          ? "bg-amber-50 text-amber-700"
                          : "bg-[#e8f0e8] text-[#3a5a3a]"
                      }`}
                    >
                      {clase.available_spots === 0
                        ? "Lleno"
                        : `${clase.capacity - clase.available_spots}/${clase.capacity} lugares`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Columna derecha */}
          <div className="bg-white rounded-2xl p-5 h-fit">
            <p className="text-xl font-semibold text-stone-800 mb-4">
              Actividad reciente
            </p>
            <ul className="flex flex-col gap-4">
              <li className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-[#e8f0e8] flex items-center justify-center flex-shrink-0">
                  <CalendarCheck size={15} className="text-[#3a5a3a]" />
                </div>
                <div>
                  <p className="text-md text-stone-800">
                    <span className="font-medium">Valeria M.</span> reservó
                    Reformer Power
                  </p>
                  <p className="text-md text-stone-600">Sábado · 07:30</p>
                  <p className="text-md text-stone-400">hace 5 min</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-[#faeeda] flex items-center justify-center flex-shrink-0">
                  <Heart size={15} className="text-amber-700" />
                </div>
                <div>
                  <p className="text-md text-stone-800">
                    <span className="font-medium">Carlos R.</span> agregó tu
                    estudio a favoritos
                  </p>
                  <p className="text-md text-stone-400">hace 18 min</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-[#e8f0e8] flex items-center justify-center flex-shrink-0">
                  <CalendarCheck size={15} className="text-[#3a5a3a]" />
                </div>
                <div>
                  <p className="text-md text-stone-800">
                    <span className="font-medium">Ana P.</span> reservó Barre
                    Classic
                  </p>
                  <p className="text-md text-stone-600">Sábado · 10:00</p>
                  <p className="text-md text-stone-400">hace 32 min</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-[#e8f0e8] flex items-center justify-center flex-shrink-0">
                  <CalendarCheck size={15} className="text-[#3a5a3a]" />
                </div>
                <div>
                  <p className="text-md text-stone-800">
                    <span className="font-medium">María L.</span> reservó Mat
                    Flow
                  </p>
                  <p className="text-md text-stone-600">Sábado · 18:00</p>
                  <p className="text-md text-stone-400">hace 1 hora</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-[#faeeda] flex items-center justify-center flex-shrink-0">
                  <Star size={15} className="text-amber-700" />
                </div>
                <div>
                  <p className="text-md text-stone-800">
                    <span className="font-medium">Sofía H.</span> dejó una
                    reseña de 5 estrellas
                  </p>
                  <p className="text-md text-stone-400">hace 2 horas</p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PanelControl;
