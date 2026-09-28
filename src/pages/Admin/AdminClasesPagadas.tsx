import { useEffect, useState } from "react";
import {
  CalendarCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { api } from "../../lib/api";
import AdminSearch from "../../components/AdminSearch";

// Postgres devuelve COUNT y SUM como texto y los montos sin registro como
// null: nada de esto es un number todavia.
type Alumno = {
  booking_id: number;
  user_id: number;
  name: string;
  last_name: string;
  email: string;
  /** Reservo con su paquete: no hubo cargo por esta clase. */
  con_paquete: boolean;
  package_name: string | null;
  /** Lo que se le cobro. NULL en las reservas anteriores a la migracion 015. */
  price_cents: number | null;
  service_fee_cents: number | null;
  /** "2026-09-18T14:00", hora local de Mexico. */
  reservada_el: string;
};

// Una clase en una fecha concreta: un horario permanente se da cada semana y
// cada fecha es su propio renglon, con sus alumnos.
type ClasePagada = {
  schedule_id: number;
  class_id: number;
  class_name: string;
  /** Precio actual de la clase, en pesos. */
  price: number;
  capacity: number;
  studio_id: number;
  studio_name: string;
  is_demo: boolean;
  alumnos_total: string;
  /** Centavos cobrados con tarjeta esa fecha; null si ninguna lo guardo. */
  cobrado_cents: string | null;
  alumnos: Alumno[];
  /** "2026-09-19"; null en las reservas viejas, que no guardaban la fecha. */
  class_date: string | null;
  time: string | null;
  end_time: string | null;
  ya_paso: boolean;
};

type Cuando = "todas" | "proximas" | "pasadas";

const CUANDO_LABEL: Record<Cuando, string> = {
  todas: "Todas",
  proximas: "Próximas",
  pasadas: "Pasadas",
};

const PER_PAGE = 25;

function money(cents: number | string | null) {
  if (cents === null || cents === "") return "—";
  return `$${(Number(cents) / 100).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function pesos(value: number) {
  return `$${Number(value || 0).toLocaleString("es-MX")}`;
}

// "2026-09-19" -> Date local. A proposito no es new Date(texto): eso lo lee
// como UTC y en Mexico pintaria el dia anterior.
function fromISODate(date: string) {
  const [y = "1970", m = "1", d = "1"] = date.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d));
}

// "2026-09-19" -> "vie 19 sep 2026".
function formatDate(date: string | null) {
  if (!date) return "Sin fecha";
  return fromISODate(date).toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// "2026-09-18T14:00" -> "18 sep, 14:00".
function formatDateTime(value: string) {
  const [date = "", time = ""] = value.split("T");
  const label = fromISODate(date).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
  });
  return `${label}, ${time}`;
}

function horario(clase: ClasePagada) {
  if (!clase.time) return "—";
  return clase.end_time ? `${clase.time} – ${clase.end_time}` : clase.time;
}

// La llave de un renglon es el horario MAS la fecha: el mismo horario
// permanente aparece una vez por semana.
function claseKey(clase: ClasePagada) {
  return `${clase.schedule_id}-${clase.class_date ?? "sin-fecha"}`;
}

function AdminClasesPagadas() {
  const [clases, setClases] = useState<ClasePagada[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [cuando, setCuando] = useState<Cuando>("todas");

  const [query, setQuery] = useState("");

  // Que renglones estan desplegados, por llave de clase.
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({});

  // `loading` es derivado, como en el resto del panel: mientras lo cargado no
  // sea lo que se pide, estamos esperando.
  const [loadedKey, setLoadedKey] = useState("");
  const pedido = `${page}-${cuando}-${query}`;
  const loading = loadedKey !== pedido;

  useEffect(() => {
    // Si se cambia de pagina antes de que llegue la respuesta anterior, esa
    // respuesta tardia no debe pisar lo que se esta viendo.
    let cancelled = false;
    api(
      `/admin/clases-pagadas?page=${page}&cuando=${cuando}&q=${encodeURIComponent(query)}`,
    )
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setClases(data.clases ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(`${page}-${cuando}-${query}`);
      });
    return () => {
      cancelled = true;
    };
  }, [page, cuando, query]);

  const from = total === 0 ? 0 : (page - 1) * PER_PAGE + 1;
  const to = Math.min(page * PER_PAGE, total);

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1
          className="text-4xl md:text-6xl font-semibold text-slate-800"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Clases{" "}
          <span
            className="text-[#1b2c44]"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            pagadas
          </span>
        </h1>
        <p className="text-slate-600 mt-2">
          {total} {total === 1 ? "clase reservada" : "clases reservadas"}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-2">
          {(["todas", "proximas", "pasadas"] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => {
                setCuando(filter);
                setPage(1);
              }}
              className={`px-4 py-1.5 rounded-full text-md transition-colors cursor-pointer ${
                cuando === filter
                  ? "bg-[#1b2c44] text-white"
                  : "border border-slate-200 text-slate-600 hover:border-slate-400"
              }`}
            >
              {CUANDO_LABEL[filter]}
            </button>
          ))}
        </div>

        {/* Buscar y cambiar de filtro vuelven a la primera pagina: la 3 del
            filtro anterior casi nunca existe en el nuevo. */}
        <AdminSearch
          placeholder="Buscar alumno, clase o estudio"
          onSearch={(q) => {
            setQuery(q);
            setPage(1);
          }}
        />
      </div>

      <div className="bg-white rounded-2xl overflow-hidden">
        {loading && clases.length === 0 ? (
          <div className="p-10 text-center text-slate-500">Cargando...</div>
        ) : clases.length === 0 ? (
          <div className="p-10 flex flex-col items-center gap-4 text-center">
            <CalendarCheck size={36} className="text-slate-300" />
            <p className="text-slate-600 font-medium">
              {query
                ? "Ninguna clase coincide con la búsqueda"
                : "Todavía no hay clases pagadas"}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="w-10" />
                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">
                      Clase
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">
                      Estudio
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">
                      Precio
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">
                      Cuándo
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">
                      Alumnos
                    </th>
                    <th
                      className="text-left px-6 py-4 text-sm font-semibold text-slate-600"
                      title="Lo cobrado con tarjeta esa fecha. Las reservas con paquete se cobraron al comprarlo."
                    >
                      Cobrado
                    </th>
                  </tr>
                </thead>
                <tbody
                  className={`transition-opacity ${loading ? "opacity-40" : ""}`}
                >
                  {clases.map((clase) => {
                    const key = claseKey(clase);
                    const abierta = abiertas[key] ?? false;

                    return [
                      <tr
                        key={key}
                        onClick={() =>
                          setAbiertas((prev) => ({ ...prev, [key]: !abierta }))
                        }
                        className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors cursor-pointer"
                      >
                        <td className="pl-4">
                          {/* El renglon entero abre y cierra; el boton lleva
                              el mismo clic para que tambien funcione con el
                              teclado, y no deja que suba a la fila para no
                              alternarlo dos veces. */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setAbiertas((prev) => ({
                                ...prev,
                                [key]: !abierta,
                              }));
                            }}
                            aria-expanded={abierta}
                            aria-label={`Ver los alumnos de ${clase.class_name}`}
                            className="flex items-center justify-center w-7 h-7 rounded-full text-slate-400 hover:text-[#1b2c44] transition-colors cursor-pointer"
                          >
                            <ChevronDown
                              size={16}
                              className={`transition-transform ${abierta ? "rotate-180" : ""}`}
                            />
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <p className="text-slate-800 font-medium">
                            {clase.class_name}
                          </p>
                          <p className="text-slate-400 text-xs">
                            #{clase.class_id}
                          </p>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <p className="text-slate-600 flex items-center gap-2">
                            {clase.studio_name}
                            {clase.is_demo && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs">
                                Demo
                              </span>
                            )}
                          </p>
                          <p className="text-slate-400 text-xs">
                            #{clase.studio_id}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-slate-600 whitespace-nowrap">
                          {pesos(clase.price)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <p className="text-slate-800">
                            {formatDate(clase.class_date)}
                          </p>
                          <p className="text-slate-500 text-xs flex items-center gap-2">
                            {horario(clase)}
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs ${
                                clase.ya_paso
                                  ? "bg-slate-100 text-slate-500"
                                  : "bg-[#1b2c44]/10 text-[#1b2c44]"
                              }`}
                            >
                              {clase.ya_paso ? "Pasada" : "Próxima"}
                            </span>
                          </p>
                        </td>
                        <td className="px-6 py-4 text-slate-600 whitespace-nowrap">
                          {clase.alumnos_total}
                          <span className="text-slate-400">
                            {" "}
                            / {clase.capacity}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-600 whitespace-nowrap">
                          {money(clase.cobrado_cents)}
                        </td>
                      </tr>,

                      abierta && (
                        <tr key={`${key}-alumnos`} className="bg-slate-50/60">
                          <td />
                          <td colSpan={6} className="px-6 py-4">
                            <p className="text-xs font-semibold text-slate-500 mb-3">
                              Alumnos que pagaron esta clase
                            </p>
                            <ul className="flex flex-col gap-2">
                              {clase.alumnos.map((alumno) => (
                                <li
                                  key={alumno.booking_id}
                                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm"
                                >
                                  <span className="text-slate-800 font-medium">
                                    {alumno.name} {alumno.last_name}
                                  </span>
                                  <span className="text-slate-500">
                                    {alumno.email}
                                  </span>
                                  <span className="text-slate-400 text-xs">
                                    #{alumno.user_id}
                                  </span>
                                  {alumno.con_paquete ? (
                                    <span className="px-2 py-0.5 rounded-full bg-[#1b2c44]/10 text-[#1b2c44] text-xs">
                                      Paquete
                                      {alumno.package_name
                                        ? `: ${alumno.package_name}`
                                        : ""}
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs">
                                      Tarjeta {money(alumno.price_cents)}
                                    </span>
                                  )}
                                  <span className="text-slate-400 text-xs ml-auto">
                                    Reservó el{" "}
                                    {formatDateTime(alumno.reservada_el)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ),
                    ];
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-t border-slate-100">
              <p className="text-sm text-slate-500">
                Mostrando {from}–{to} de {total}
              </p>

              {totalPages > 1 && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    aria-label="Página anterior"
                    className="flex items-center justify-center w-9 h-9 rounded-full border border-slate-200 text-slate-600 transition-colors cursor-pointer hover:border-[#1b2c44] hover:text-[#1b2c44] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:text-slate-600"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <p className="text-sm text-slate-600">
                    Página {page} de {totalPages}
                  </p>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    aria-label="Página siguiente"
                    className="flex items-center justify-center w-9 h-9 rounded-full border border-slate-200 text-slate-600 transition-colors cursor-pointer hover:border-[#1b2c44] hover:text-[#1b2c44] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:text-slate-600"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default AdminClasesPagadas;
