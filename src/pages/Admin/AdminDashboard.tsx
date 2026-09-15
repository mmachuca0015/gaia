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
  commission: { commission: string | null };
  newStudios: { total: string };
  newUsers: { total: string };
};

// `periodo` es una fecha en los periodos largos y la hora (un numero) con
// "hoy", segun el GROUP BY que arma el backend. De ahi el String() al pintarlo.
type ChartRow = {
  periodo: string | number;
  total: string;
  amount: string | null;
};

type AdminCharts = {
  transactions: ChartRow[];
  users: ChartRow[];
  studios: ChartRow[];
};

function AdminDashboard() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);

  useEffect(() => {
    api("/admin/metrics")
      .then((res) => res.json())
      .then((data) => setMetrics(data));
  }, []);

  const [activeFilter, setActiveFilter] = useState<
    "hoy" | "semana" | "mes" | "semestral"
  >("semana");
  const [chartData, setChartData] = useState<AdminCharts | null>(null);

  useEffect(() => {
    api(`/admin/charts?period=${activeFilter}`)
      .then((res) => res.json())
      .then((data) => setChartData(data));
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-5">
          <p className="text-md text-slate-600 mb-1">Total transacciones</p>
          <p
            className="text-3xl font-semibold text-slate-800"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            {metrics?.transactions.total || 0}
          </p>
          <p className="text-md text-slate-600 mt-1">
            ${Number(metrics?.transactions.total_amount || 0).toLocaleString()}{" "}
            MXN
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5">
          <p className="text-md text-slate-600 mb-1">Mi comisión</p>
          <p
            className="text-3xl font-semibold text-slate-800"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            ${Number(metrics?.commission.commission || 0).toFixed(2)}
          </p>
          <p className="text-md text-slate-600 mt-1">3.6% por reserva</p>
        </div>

        <div className="bg-white rounded-2xl p-5">
          <p className="text-md text-slate-600 mb-1">Estudios nuevos</p>
          <p
            className="text-3xl font-semibold text-slate-800"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            {metrics?.newStudios.total || 0}
          </p>
          <p className="text-md text-slate-600 mt-1">Últimos 30 días</p>
        </div>

        <div className="bg-white rounded-2xl p-5">
          <p className="text-md text-slate-600 mb-1">Usuarios nuevos</p>
          <p
            className="text-3xl font-semibold text-slate-800"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            {metrics?.newUsers.total || 0}
          </p>
          <p className="text-md text-slate-600 mt-1">Últimos 30 días</p>
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
            {filter === "hoy"
              ? "Hoy"
              : filter === "semana"
                ? "7 días"
                : filter === "mes"
                  ? "1 mes"
                  : "6 meses"}
          </button>
        ))}
      </div>

      {/* Gráficas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-5">
          <p className="font-semibold text-slate-800 mb-4">Transacciones</p>
          <Line
            data={{
              labels:
                chartData?.transactions.map((d: ChartRow) => String(d.periodo)) ||
                [],
              datasets: [
                {
                  label: "Monto",
                  data:
                    chartData?.transactions.map((d: ChartRow) => Number(d.amount)) ||
                    [],
                  borderColor: "#1b2c44",
                  backgroundColor: "rgba(58,90,58,0.08)",
                  fill: true,
                  tension: 0.4,
                },
              ],
            }}
            options={{
              responsive: true,
              plugins: { legend: { display: false } },
              scales: { y: { display: false }, x: { display: false } },
            }}
          />
        </div>

        <div className="bg-white rounded-2xl p-5">
          <p className="font-semibold text-slate-800 mb-4">Mi comisión</p>
          <Line
            data={{
              labels:
                chartData?.transactions.map((d: ChartRow) => String(d.periodo)) ||
                [],
              datasets: [
                {
                  data:
                    chartData?.transactions.map(
                      (d: ChartRow) => Number(d.amount) * 0.036,
                    ) || [],
                  borderColor: "#1b2c44",
                  backgroundColor: "rgba(58,90,58,0.08)",
                  fill: true,
                  tension: 0.4,
                },
              ],
            }}
            options={{
              responsive: true,
              plugins: { legend: { display: false } },
              scales: { y: { display: false }, x: { display: false } },
            }}
          />
        </div>

        {/* Gráficas */}
        <div className="bg-white rounded-2xl p-5">
          <p className="font-semibold text-slate-800 mb-4">Usuarios nuevos</p>
          <Line
            data={{
              labels: chartData?.users.map((d: ChartRow) => String(d.periodo)) || [],
              datasets: [
                {
                  data: chartData?.users.map((d: ChartRow) => Number(d.total)) || [],
                  borderColor: "#1b2c44",
                  backgroundColor: "rgba(58,90,58,0.08)",
                  fill: true,
                  tension: 0.4,
                },
              ],
            }}
            options={{
              responsive: true,
              plugins: { legend: { display: false } },
              scales: { y: { display: false }, x: { display: false } },
            }}
          />
        </div>

        <div className="bg-white rounded-2xl p-5">
          <p className="font-semibold text-slate-800 mb-4">Estudios nuevos</p>
          <Line
            data={{
              labels:
                chartData?.studios.map((d: ChartRow) => String(d.periodo)) || [],
              datasets: [
                {
                  data:
                    chartData?.studios.map((d: ChartRow) => Number(d.total)) || [],
                  borderColor: "#1b2c44",
                  backgroundColor: "rgba(58,90,58,0.08)",
                  fill: true,
                  tension: 0.4,
                },
              ],
            }}
            options={{
              responsive: true,
              plugins: { legend: { display: false } },
              scales: { y: { display: false }, x: { display: false } },
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;
