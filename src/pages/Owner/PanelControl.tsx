import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarCheck, Heart, Package } from "lucide-react";
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
import ShareStudioButton from "../../components/ShareStudioButton";
import BranchTabs from "../../components/BranchTabs";
import { useBranches } from "../../lib/branches";
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
);

// GET /studios/:id/actividad-reciente: todo lo que pasa en el estudio en los
// ultimos 7 dias, de 20 en 20.
type Actividad = {
  tipo: "reserva" | "paquete" | "favorito";
  /** Id de la reserva, compra o favorito; con `tipo` forma la llave. */
  id: number;
  /** Fecha exacta como texto: se manda de vuelta como `before`. */
  cursor: string;
  name: string;
  last_name: string;
  /** Solo reservas. */
  class_name: string | null;
  class_date: string | null;
  time: string | null;
  con_paquete: boolean | null;
  /** Solo compras de paquete. */
  package_name: string | null;
  created_at: string;
};

// GET /studios/:id/clases-hoy
type TodayClass = {
  class_id: number;
  schedule_id: number;
  name: string;
  instructor: string | null;
  price: number;
  time: string;
  capacity: number;
  /** Reservas de hoy en ese horario. */
  booked: number;
};

type Period = "hoy" | "semana" | "mes" | "semestral";

const PERIOD_LABEL: Record<Period, string> = {
  hoy: "Hoy",
  semana: "7 días",
  mes: "30 días",
  semestral: "6 meses",
};

// Cada cuanto se vuelve a pedir el panel mientras esta abierto.
const REFRESH_MS = 60_000;

// Alto de cada renglon de "Clases de hoy": se ven 5 y el resto con scroll.
const CLASS_ROW_PX = 72;
const VISIBLE_CLASSES = 5;

const activityKey = (a: Actividad) => `${a.tipo}-${a.id}`;

type ActivityPage = { items: Actividad[]; has_more: boolean };

const MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

// "2026-09-18T14:00" (hora local de Mexico) -> etiqueta del eje.
function bucketLabel(periodo: string, period: Period) {
  const [date = "", time = "00:00"] = periodo.split("T");
  const [, m = "1", d = "1"] = date.split("-");
  if (period === "hoy") return `${Number(time.slice(0, 2))}:00`;
  if (period === "semestral") return MONTHS[Number(m) - 1] ?? "";
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
}

function money(value: number | string) {
  return `$${Number(value || 0).toLocaleString("es-MX", {
    maximumFractionDigits: 2,
  })}`;
}

function activityText(item: Actividad) {
  if (item.tipo === "paquete") return ` compró el paquete ${item.package_name}`;
  if (item.tipo === "favorito") return " agregó tu estudio a favoritos";
  return ` reservó ${item.class_name}${item.con_paquete ? " con su paquete" : ""}`;
}

function PanelControl() {
  // Las metricas son de una sucursal: al cambiar de pestaña se piden las de
  // la otra.
  const { branches, studio, activeId, setActiveId } = useBranches();
  const studioId = studio?.id;

  const [activeFilter, setActiveFilter] = useState<Period>("hoy");
  // "Ingresos hoy" es siempre de hoy, sin importar el filtro de la grafica.
  const [ingresosHoy, setIngresosHoy] = useState<number>(0);
  const [ingresos, setIngresos] = useState({ total: 0, reservas: 0 });
  const [graficaData, setGraficaData] = useState<
    { periodo: string; total: number | string }[]
  >([]);
  const [todayClasses, setTodayClasses] = useState<TodayClass[]>([]);
  const [actividad, setActividad] = useState<Actividad[]>([]);
  const [activityHasMore, setActivityHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // De que sucursal es lo que hay en la lista. Al cambiar de pestaña hay que
  // reemplazarla: el refresco solo agrega arriba, y sin esto se mezclaba la
  // actividad de las dos sucursales.
  const activityStudio = useRef<number | undefined>(undefined);

  // Primera pagina de la actividad. Al refrescar no se reemplaza la lista
  // (el dueño pudo haber bajado y cargado mas): solo se agregan arriba los
  // elementos nuevos.
  const loadActivity = useCallback(() => {
    if (!studioId) return;
    api(`/studios/${studioId}/actividad-reciente`)
      .then((res) => res.json())
      .then((page: ActivityPage) => {
        const otraSucursal = activityStudio.current !== studioId;
        activityStudio.current = studioId;
        setActividad((current) => {
          if (otraSucursal || current.length === 0) {
            setActivityHasMore(page.has_more);
            return page.items;
          }
          const known = new Set(current.map(activityKey));
          const fresh = page.items.filter((a) => !known.has(activityKey(a)));
          return fresh.length ? [...fresh, ...current] : current;
        });
      });
  }, [studioId]);

  // Siguientes 20, a partir del ultimo que ya se ve.
  const loadMoreActivity = useCallback(() => {
    const last = actividad[actividad.length - 1];
    if (!studioId || !last || !activityHasMore || loadingMore) return;
    setLoadingMore(true);
    api(
      `/studios/${studioId}/actividad-reciente?before=${encodeURIComponent(last.cursor)}`,
    )
      .then((res) => res.json())
      .then((page: ActivityPage) => {
        setActividad((current) => {
          const known = new Set(current.map(activityKey));
          return [
            ...current,
            ...page.items.filter((a) => !known.has(activityKey(a))),
          ];
        });
        setActivityHasMore(page.has_more);
      })
      .finally(() => setLoadingMore(false));
  }, [studioId, actividad, activityHasMore, loadingMore]);

  // Cuando el final de la lista entra a la vista (dentro del bloque con
  // scroll), se piden los siguientes.
  const activityScrollRef = useRef<HTMLDivElement | null>(null);
  const activityEndRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = activityScrollRef.current;
    const end = activityEndRef.current;
    if (!root || !end || !activityHasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMoreActivity();
      },
      { root, rootMargin: "80px" },
    );
    observer.observe(end);
    return () => observer.disconnect();
  }, [loadMoreActivity, activityHasMore]);

  const loadToday = useCallback(() => {
    if (!studioId) return;
    api(`/studios/${studioId}/ingresos?period=hoy`)
      .then((res) => res.json())
      .then((data) => setIngresosHoy(Number(data.total) || 0));
    api(`/studios/${studioId}/clases-hoy`)
      .then((res) => res.json())
      .then((data) => setTodayClasses(data));
    loadActivity();
  }, [studioId, loadActivity]);

  const loadPeriod = useCallback(() => {
    if (!studioId) return;
    api(`/studios/${studioId}/ingresos?period=${activeFilter}`)
      .then((res) => res.json())
      .then((data) => setIngresos(data));
    api(`/studios/${studioId}/ingresos-grafica?period=${activeFilter}`)
      .then((res) => res.json())
      .then((data) => setGraficaData(data));
  }, [studioId, activeFilter]);

  useEffect(loadToday, [loadToday]);
  useEffect(loadPeriod, [loadPeriod]);

  // El panel se queda abierto mucho tiempo: se refresca solo cada minuto y al
  // volver a la pestaña, para que las reservas, compras y favoritos nuevos
  // aparezcan sin recargar.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      loadToday();
      loadPeriod();
    };
    const timer = setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadToday, loadPeriod]);

  const totalCapacity = todayClasses.reduce((a, c) => a + c.capacity, 0);
  const totalBooked = todayClasses.reduce(
    (a, c) => a + Math.min(c.booked, c.capacity),
    0,
  );
  const periodTotal = Number(ingresos.total) || 0;

  return (
    <div>
      <div className="p-4 md:p-8">
        <div className="mb-8 flex flex-wrap items-center gap-x-5 gap-y-3">
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
          {/* Link publico para sus redes, su pagina, WhatsApp... */}
          {studio && (
            <ShareStudioButton
              studioId={studio.id}
              studioName={studio.name}
              mode="copy"
              label="Copiar link del estudio"
            />
          )}
        </div>

        <div className="mb-6">
          <BranchTabs
            branches={branches}
            activeId={activeId}
            onSelect={setActiveId}
          />
        </div>

        {/* Layout de dos columnas */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_450px] gap-4">
          {/* Columna izquierda */}
          <div className="flex flex-col gap-4">
            {/* Resumen de hoy */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl p-5 text-center">
                <p className="text-xl text-slate-600 mb-1">Ingresos hoy</p>
                <p
                  className="text-5xl font-semibold text-slate-800"
                  style={{ fontFamily: "Cormorant Garamond, serif" }}
                >
                  {money(ingresosHoy)}
                </p>
                <p className="text-md text-slate-500 mt-3">Clases y paquetes</p>
              </div>
              <div className="bg-white rounded-2xl p-5 text-center">
                <p className="text-xl text-slate-600 mb-1">Clases hoy</p>
                <p
                  className="text-5xl font-semibold text-slate-800"
                  style={{ fontFamily: "Cormorant Garamond, serif" }}
                >
                  {todayClasses.length}
                </p>
                <p className="text-md text-slate-500 mt-3">
                  {todayClasses.length === 0
                    ? "Sin clases programadas"
                    : `${totalCapacity - totalBooked} de ${totalCapacity} lugares disponibles`}
                </p>
              </div>
            </div>

            {/* Ingresos */}
            <div className="bg-white rounded-2xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <p className="font-semibold text-slate-800">Ingresos</p>
                <div className="flex gap-2">
                  {(Object.keys(PERIOD_LABEL) as Period[]).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setActiveFilter(filter)}
                      className={`px-3 py-1 rounded-full text-md transition-colors cursor-pointer ${
                        activeFilter === filter
                          ? "bg-[#1b2c44] text-white"
                          : "border border-slate-200 text-slate-600 hover:border-slate-400"
                      }`}
                    >
                      {PERIOD_LABEL[filter]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <p className="text-md text-slate-600">
                  Total del periodo · clases y paquetes
                </p>
                <p
                  className="text-5xl font-semibold text-slate-800"
                  style={{ fontFamily: "Cormorant Garamond, serif" }}
                >
                  {money(periodTotal)}
                </p>
                <p className="text-md text-slate-500">
                  {Number(ingresos.reservas) || 0}{" "}
                  {Number(ingresos.reservas) === 1 ? "reserva" : "reservas"}
                </p>
              </div>

              {/* Grafica: siempre trae todos los puntos del periodo, en cero
                  si no hubo ventas, asi que nunca queda en blanco. */}
              <div className="relative" style={{ height: "260px" }}>
                <Line
                  data={{
                    labels: graficaData.map((d) =>
                      bucketLabel(d.periodo, activeFilter),
                    ),
                    datasets: [
                      {
                        data: graficaData.map((d) => Number(d.total)),
                        borderColor: "#1b2c44",
                        backgroundColor: "rgba(27,44,68,0.06)",
                        fill: true,
                        tension: 0.35,
                        // Monotona: la curva no se pasa de los valores reales ni baja de cero.
                        cubicInterpolationMode: "monotone",
                        pointRadius: graficaData.length > 12 ? 0 : 3,
                        pointHoverRadius: 4,
                        pointBackgroundColor: "#1b2c44",
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        displayColors: false,
                        callbacks: {
                          label: (ctx) => money(ctx.parsed.y ?? 0),
                        },
                      },
                    },
                    scales: {
                      y: {
                        beginAtZero: true,
                        // Sin ventas, la escala de 0 a 1 deja la linea en el
                        // piso en lugar de centrarla.
                        suggestedMax: periodTotal > 0 ? undefined : 1,
                        display: false,
                      },
                      x: {
                        grid: { display: false },
                        border: { display: false },
                        ticks: {
                          color: "#94a3b8",
                          maxRotation: 0,
                          autoSkip: true,
                          maxTicksLimit: 7,
                        },
                      },
                    },
                  }}
                />
                {graficaData.length > 0 && periodTotal === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="text-sm text-slate-500 bg-white/90 border border-slate-100 rounded-xl px-4 py-2">
                      Aún no hay ingresos{" "}
                      {activeFilter === "hoy"
                        ? "hoy"
                        : `en los últimos ${PERIOD_LABEL[activeFilter]}`}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Clases de hoy */}
            <div className="bg-white rounded-2xl p-5">
              <p className="font-semibold text-slate-800 mb-4">Clases de hoy</p>
              {todayClasses.length === 0 ? (
                <p className="text-md text-slate-500 py-6 text-center">
                  No tienes clases programadas para hoy.
                </p>
              ) : (
                <div
                  className="flex flex-col overflow-y-auto pr-1"
                  style={{ maxHeight: CLASS_ROW_PX * VISIBLE_CLASSES }}
                >
                  {todayClasses.map((clase) => {
                    const full = clase.booked >= clase.capacity;
                    return (
                      <div
                        key={clase.schedule_id}
                        className="flex items-center justify-between gap-3 border-b border-slate-100 last:border-0 shrink-0"
                        style={{ height: CLASS_ROW_PX }}
                      >
                        <div className="flex items-center gap-4">
                          <p
                            className="text-2xl font-semibold text-slate-800"
                            style={{ fontFamily: "Cormorant Garamond, serif" }}
                          >
                            {clase.time}
                          </p>
                          <div>
                            <p className="font-medium text-slate-800">
                              {clase.name}
                            </p>
                            {clase.instructor && (
                              <p className="text-md text-slate-600">
                                con {clase.instructor}
                              </p>
                            )}
                          </div>
                        </div>
                        {/* Ocupados / capacidad, por ejemplo 5/10 */}
                        <span
                          className={`text-md px-3 py-1 rounded-full whitespace-nowrap ${
                            full
                              ? "bg-amber-50 text-amber-700"
                              : "bg-[#e8eef7] text-[#1b2c44]"
                          }`}
                        >
                          {clase.booked}/{clase.capacity}
                          {full ? " · Lleno" : " ocupados"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Actividad reciente. En pantalla grande mide lo mismo que la
              columna izquierda (termina donde termina "Clases de hoy") y el
              resto se ve con scroll dentro del bloque. */}
          <div className="relative h-[560px] lg:h-auto">
            <div className="bg-white rounded-2xl p-5 flex flex-col absolute inset-0">
              <div className="border-b border-slate-100 pb-4 mb-4">
                <p className="font-semibold text-slate-800">
                  Actividad reciente
                </p>
                <p className="text-sm text-slate-400">Últimos 7 días</p>
              </div>
              <div
                ref={activityScrollRef}
                className="flex-1 min-h-0 overflow-y-auto pr-1"
              >
                {actividad.length === 0 ? (
                  <p className="text-md text-slate-500 py-6 text-center">
                    Aquí verás las reservas, compras de paquetes y favoritos de
                    tu estudio de los últimos 7 días.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-4">
                    {actividad.map((item) => (
                      <li
                        key={activityKey(item)}
                        className="flex items-start gap-3 border-b border-slate-100 last:border-0 pb-4"
                      >
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                            item.tipo === "favorito"
                              ? "bg-[#faeeda]"
                              : "bg-[#e8eef7]"
                          }`}
                        >
                          {item.tipo === "reserva" ? (
                            <CalendarCheck
                              size={15}
                              className="text-[#1b2c44]"
                            />
                          ) : item.tipo === "paquete" ? (
                            <Package size={15} className="text-[#1b2c44]" />
                          ) : (
                            <Heart size={15} className="text-amber-700" />
                          )}
                        </div>
                        <div>
                          <p className="text-md text-slate-800">
                            <span className="font-medium">
                              {item.name} {item.last_name}
                            </span>
                            {activityText(item)}
                          </p>
                          <p className="text-md text-slate-400">
                            {new Date(item.created_at).toLocaleDateString(
                              "es-MX",
                              {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {/* Al verse este final, se cargan los siguientes 20 */}
                <div ref={activityEndRef} />
                {loadingMore && (
                  <p className="text-sm text-slate-400 text-center py-3">
                    Cargando…
                  </p>
                )}
                {!activityHasMore && actividad.length > 0 && (
                  <p className="text-sm text-slate-400 text-center py-3">
                    Eso es todo de los últimos 7 días
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PanelControl;
