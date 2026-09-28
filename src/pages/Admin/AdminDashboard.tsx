import { useEffect, useState } from "react";
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
import { fetchFees, formatPercent, type Fees } from "../../lib/fees";
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
);

// Postgres devuelve COUNT y SUM como texto (un bigint o un numeric no caben
// siempre en un number de JS) y SUM sale null cuando no hay filas. Por eso todo
// pasa por Number() antes de pintarse: no son numeros todavia.
type AdminMetrics = {
  transactions: { total: string; total_amount: string | null };
  /** Cargo por servicio del alumno + comision del estudio, en pesos. */
  commission: {
    commission: string | null;
    service_fee: string | null;
    studio_commission: string | null;
  };
  newStudios: { total: string };
  newUsers: { total: string };
  /** Lo que gano Wellco hoy, hora de Mexico. Suscripciones sin IVA. */
  today: {
    service_fee: string;
    studio_commission: string;
    subscriptions: string;
  };
};

// GET /admin/charts: un renglon por punto del periodo, ya relleno con ceros
// por el backend, con las series de la pantalla.
type ChartRow = {
  /** "2026-09-18T14:00", hora local de Mexico. */
  periodo: string;
  transacciones: string;
  monto: string;
  /** Lo que pago el alumno encima del precio, en pesos. */
  cargo_servicio: string;
  /** Lo que se le desconto al estudio, en pesos. */
  comision_estudio: string;
  /** Cobros de suscripcion ya con descuentos, sin IVA, en pesos. */
  suscripciones: string;
  usuarios: string;
  estudios: string;
};

type Period = "hoy" | "semana" | "mes" | "semestral";

const PERIOD_LABEL: Record<Period, string> = {
  hoy: "Hoy",
  semana: "7 días",
  mes: "1 mes",
  semestral: "6 meses",
};

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

// Mes en curso en hora de Mexico, el mismo que usa /admin/metrics para
// contar las altas. Se calcula en cada render: el panel puede quedar abierto
// de un mes a otro.
function currentMonth() {
  return new Intl.DateTimeFormat("es-MX", {
    month: "long",
    timeZone: "America/Mexico_City",
  }).format(new Date());
}

function money(value: number | string) {
  return `$${Number(value || 0).toLocaleString("es-MX", {
    maximumFractionDigits: 2,
  })}`;
}

function count(value: number | string) {
  return Number(value || 0).toLocaleString("es-MX");
}

type GraficaProps = {
  title: string;
  rows: ChartRow[];
  period: Period;
  /** Valor de cada punto; sale del renglon que manda el backend. */
  value: (row: ChartRow) => number;
  /** Como se lee un punto en el tooltip y el total del periodo. */
  format: (value: number) => string;
  /** Que decir cuando todos los puntos son cero. */
  empty: string;
};

// Una grafica del panel. El backend manda todos los puntos del periodo (en
// cero si no hubo nada), asi que la linea siempre se pinta; cuando el total
// del periodo es cero se explica encima, en lugar de dejar un recuadro blanco.
function Grafica({ title, rows, period, value, format, empty }: GraficaProps) {
  const points = rows.map(value);
  const total = points.reduce((sum, n) => sum + n, 0);

  return (
    <div className="bg-white rounded-2xl p-5">
      <div className="flex items-baseline justify-between mb-4">
        <p className="font-semibold text-slate-800">{title}</p>
        <p className="text-md text-slate-500">{format(total)}</p>
      </div>

      <div className="relative" style={{ height: "220px" }}>
        <Line
          data={{
            labels: rows.map((row) => bucketLabel(row.periodo, period)),
            datasets: [
              {
                data: points,
                borderColor: "#1b2c44",
                backgroundColor: "rgba(27,44,68,0.06)",
                fill: true,
                tension: 0.35,
                // Monotona: la curva no se pasa de los valores reales ni baja de cero.
                cubicInterpolationMode: "monotone",
                pointRadius: rows.length > 12 ? 0 : 3,
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
                  label: (ctx) => format(ctx.parsed.y ?? 0),
                },
              },
            },
            scales: {
              y: {
                beginAtZero: true,
                // Sin movimiento, la escala de 0 a 1 deja la linea en el
                // piso en lugar de centrarla.
                suggestedMax: total > 0 ? undefined : 1,
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
        {rows.length > 0 && total === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-sm text-slate-500 bg-white/90 border border-slate-100 rounded-xl px-4 py-2">
              {empty}{" "}
              {period === "hoy"
                ? "hoy"
                : `en los últimos ${PERIOD_LABEL[period].toLowerCase()}`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function AdminDashboard() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);

  // Porcentajes vigentes, para los titulos. Se editan en /admin/suscripciones;
  // lo ya cobrado guardo los suyos, asi que las cifras no dependen de estos.
  const [fees, setFees] = useState<Fees | null>(null);
  useEffect(() => {
    fetchFees()
      .then(setFees)
      .catch(() => setFees(null));
  }, []);
  const servicePct = fees ? ` (${formatPercent(fees.service_fee_percent)}%)` : "";
  const commissionPct = fees ? ` (${formatPercent(fees.commission_percent)}%)` : "";

  useEffect(() => {
    api("/admin/metrics")
      .then((res) => res.json())
      .then((data) => setMetrics(data));
  }, []);

  const [activeFilter, setActiveFilter] = useState<Period>("semana");
  const [chartData, setChartData] = useState<ChartRow[]>([]);

  useEffect(() => {
    api(`/admin/charts?period=${activeFilter}`)
      .then((res) => res.json())
      .then((data) => setChartData(Array.isArray(data) ? data : []));
  }, [activeFilter]);

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1
          className="text-4xl md:text-6xl font-semibold text-slate-800"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Dashboard{" "}
          <span
            className="text-[#1b2c44]"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            Admin
          </span>
        </h1>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {/* En celular ocupa el renglon entero: con cinco bloques en dos
            columnas el ultimo quedaria solo. */}
        <div className="bg-white rounded-2xl p-5 col-span-2 lg:col-span-1">
          <p className="text-md text-slate-600 mb-1">Ingresos de hoy</p>
          <p
            className="text-3xl font-semibold text-slate-800"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            {money(
              (
                Number(metrics?.today?.service_fee || 0) +
                Number(metrics?.today?.studio_commission || 0) +
                Number(metrics?.today?.subscriptions || 0)
              ).toFixed(2),
            )}
          </p>
          <p className="text-md text-slate-600 mt-1">
            {money(Number(metrics?.today?.service_fee || 0).toFixed(2))} alumnos ·{" "}
            {money(Number(metrics?.today?.studio_commission || 0).toFixed(2))}{" "}
            estudios ·{" "}
            {money(Number(metrics?.today?.subscriptions || 0).toFixed(2))}{" "}
            suscripciones
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5">
          <p className="text-md text-slate-600 mb-1">Transacciones de estudios</p>
          <p
            className="text-3xl font-semibold text-slate-800"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            {metrics?.transactions.total || 0}
          </p>
          <p className="text-md text-slate-600 mt-1">
            {money(metrics?.transactions.total_amount || 0)} MXN
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5">
          <p className="text-md text-slate-600">Mi comisión</p>
          {fees && (
            <p className="text-xs text-slate-400 mb-1">
              {formatPercent(fees.service_fee_percent)}% alumno /{" "}
              {formatPercent(fees.commission_percent)}% estudio
            </p>
          )}
          <p
            className="text-3xl font-semibold text-slate-800"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            {money(Number(metrics?.commission.commission || 0).toFixed(2))}
          </p>
          {/* El desglose en pesos, no los porcentajes: esos viven en el
              backend y lo ya cobrado no cambia aunque se muevan. */}
          <p className="text-md text-slate-600 mt-1">
            {money(Number(metrics?.commission.service_fee || 0).toFixed(2))}{" "}
            alumnos ·{" "}
            {money(Number(metrics?.commission.studio_commission || 0).toFixed(2))}{" "}
            estudios
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5">
          <p className="text-md text-slate-600 mb-1">Estudios nuevos</p>
          <p
            className="text-3xl font-semibold text-slate-800"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            {metrics?.newStudios.total || 0}
          </p>
          <p className="text-md text-slate-600 mt-1">En {currentMonth()}</p>
        </div>

        <div className="bg-white rounded-2xl p-5">
          <p className="text-md text-slate-600 mb-1">Usuarios nuevos</p>
          <p
            className="text-3xl font-semibold text-slate-800"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            {metrics?.newUsers.total || 0}
          </p>
          <p className="text-md text-slate-600 mt-1">En {currentMonth()}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-4">
        {(["hoy", "semana", "mes", "semestral"] as const).map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`px-4 py-1.5 rounded-full text-md transition-colors cursor-pointer ${
              activeFilter === filter
                ? "bg-[#1b2c44] text-white"
                : "border border-slate-200 text-slate-600 hover:border-slate-400"
            }`}
          >
            {PERIOD_LABEL[filter]}
          </button>
        ))}
      </div>

      {/* Gráficas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Grafica
          title="Transacciones de estudios"
          rows={chartData}
          period={activeFilter}
          value={(row) => Number(row.monto)}
          format={money}
          empty="Aún no hay transacciones"
        />

        {/* Los porcentajes no se escriben aqui: vienen de /payments/fees y
            una copia se quedaria vieja. */}
        <Grafica
          title={`Cargo por servicio a alumnos${servicePct}`}
          rows={chartData}
          period={activeFilter}
          value={(row) => Number(row.cargo_servicio)}
          format={money}
          empty="Aún no hay cargos por servicio"
        />

        <Grafica
          title={`Comisión a estudios${commissionPct}`}
          rows={chartData}
          period={activeFilter}
          value={(row) => Number(row.comision_estudio)}
          format={money}
          empty="Aún no hay comisión de estudios"
        />

        <Grafica
          title="Suscripciones (sin IVA)"
          rows={chartData}
          period={activeFilter}
          value={(row) => Number(row.suscripciones)}
          format={money}
          empty="Aún no hay cobros de suscripción"
        />


        <Grafica
          title="Usuarios nuevos"
          rows={chartData}
          period={activeFilter}
          value={(row) => Number(row.usuarios)}
          format={count}
          empty="Aún no hay usuarios nuevos"
        />

        <Grafica
          title="Estudios nuevos"
          rows={chartData}
          period={activeFilter}
          value={(row) => Number(row.estudios)}
          format={count}
          empty="Aún no hay estudios nuevos"
        />
      </div>
    </div>
  );
}

export default AdminDashboard;
