import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, CreditCard } from "lucide-react";

import { api } from "../../lib/api";
import AdminSearch from "../../components/AdminSearch";

// GET /admin/pagos-suscripciones. Sale de Stripe, que es donde esta el
// historico completo de cobros y lo unico que sabe con que tarjeta se pago.
type Pago = {
  invoice_id: string;
  /** Segundos epoch: el momento en que el cobro cerro. */
  pagado_en: number;
  amount_cents: number;
  currency: string;
  /** "Alta", "Renovación", "Ajuste"… */
  razon: string;
  plan_name: string | null;
  /** "mes" o "año"; null si no se pudo saber. */
  intervalo: string | null;
  owner_id: number | null;
  owner_name: string | null;
  email: string | null;
  studio_id: number | null;
  studio_name: string | null;
  sucursales: number;
  /** "visa", "mastercard", "amex"…, como los nombra Stripe. */
  card_brand: string | null;
  card_last4: string | null;
};

type Pagina = {
  pagos: Pago[];
  has_more: boolean;
  next: string | null;
  /** La busqueda encontro mas estudios de los que se pueden revisar. */
  truncado: boolean;
};

// Como se escriben las marcas que manda Stripe. Lo que no este aqui se pinta
// tal cual, con la primera en mayuscula: mas vale una marca nueva escrita a
// medias que una que no se vea.
const MARCAS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
  american_express: "Amex",
  discover: "Discover",
  diners: "Diners",
  jcb: "JCB",
  unionpay: "UnionPay",
  cartes_bancaires: "Cartes Bancaires",
  eftpos_au: "Eftpos",
  link: "Link",
  unknown: "Tarjeta",
};

function marca(brand: string | null) {
  if (!brand) return "Tarjeta";
  return MARCAS[brand] ?? brand.charAt(0).toUpperCase() + brand.slice(1);
}

function money(cents: number, currency: string) {
  return `$${(cents / 100).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

// Epoch -> "17 sep 2026, 11:21 p.m." en hora de Mexico. La zona va explicita:
// el admin puede abrir el panel desde otra y la hora del cobro no cambia.
function fechaHora(epoch: number) {
  return new Date(epoch * 1000).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AdminPagos() {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [truncado, setTruncado] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  // Stripe pagina con cursor, no con numero de pagina: para poder regresar se
  // guarda la pila de cursores por los que se ha pasado. El de la pagina 1 es
  // null, que es pedirla sin cursor.
  const [cursores, setCursores] = useState<(string | null)[]>([null]);
  const [indice, setIndice] = useState(0);

  const [loadedKey, setLoadedKey] = useState("");
  const cursor = cursores[indice] ?? null;
  const loading = loadedKey !== `${indice}-${cursor}-${query}`;

  // Buscando no hay cursor que valga: los cobros vienen de varios clientes y
  // se juntan en el servidor, asi que esa lista se pagina por numero.
  const url = query
    ? `/admin/pagos-suscripciones?q=${encodeURIComponent(query)}&page=${indice + 1}`
    : `/admin/pagos-suscripciones${cursor ? `?after=${cursor}` : ""}`;

  const buscar = (q: string) => {
    setLoadedKey("");
    setQuery(q);
    setIndice(0);
    setCursores([null]);
  };

  // Al moverse de pagina se borra lo cargado: sin esto, volver a una pagina
  // ya vista dejaba los renglones de la otra en pantalla, sin atenuar, hasta
  // que llegaba la respuesta.
  const irA = (siguiente: number) => {
    setLoadedKey("");
    setIndice(siguiente);
  };


  useEffect(() => {
    let cancelled = false;
    api(url)
      .then((res) => res.json())
      .then((data: Pagina & { error?: string }) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
          return;
        }
        setError("");
        setPagos(data.pagos ?? []);
        setHasMore(Boolean(data.has_more));
        setTruncado(Boolean(data.truncado));
        // El cursor de la pagina siguiente se guarda al llegar, no antes:
        // solo Stripe sabe donde termino esta.
        if (!query && data.has_more && data.next) {
          setCursores((prev) =>
            prev.length > indice + 1 ? prev : [...prev, data.next],
          );
        }
      })
      .catch(() => {
        if (!cancelled) setError("No se pudieron cargar los pagos");
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(`${indice}-${cursor}-${query}`);
      });
    return () => {
      cancelled = true;
    };
  }, [url, cursor, indice, query]);

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1
          className="text-4xl md:text-6xl font-semibold text-slate-800"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Pagos de{" "}
          <span
            className="text-[#1b2c44]"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            suscripciones
          </span>
        </h1>
        <p className="text-slate-600 mt-2">
          Los cobros que cerraron, del más reciente al más viejo. El monto es lo
          que se le cargó a la tarjeta, con IVA.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 mb-4">
        <AdminSearch placeholder="Buscar estudio, dueño o correo" onSearch={buscar} />
      </div>

      {truncado && (
        <p className="text-sm text-slate-500 bg-[#faeeda] border border-amber-200 rounded-xl px-4 py-2 mb-4">
          La búsqueda coincide con muchos estudios y solo se están revisando los
          primeros. Escribe algo más preciso para verlos todos.
        </p>
      )}

      <div className="bg-white rounded-2xl overflow-hidden">
        {error ? (
          <div className="p-10 text-center text-red-500">{error}</div>
        ) : loading && pagos.length === 0 ? (
          <div className="p-10 text-center text-slate-500">Cargando...</div>
        ) : pagos.length === 0 ? (
          <div className="p-10 flex flex-col items-center gap-4 text-center">
            <CreditCard size={36} className="text-slate-300" />
            <p className="text-slate-600 font-medium">
              {query
                ? "Ningún pago coincide con la búsqueda"
                : "Todavía no hay pagos de suscripción"}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">
                      Estudio
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">
                      Correo
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">
                      Tarjeta
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">
                      Plan
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">
                      Cobrado el
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">
                      Monto
                    </th>
                  </tr>
                </thead>
                <tbody
                  className={`transition-opacity ${loading ? "opacity-40" : ""}`}
                >
                  {pagos.map((pago) => (
                    <tr
                      key={pago.invoice_id}
                      className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        {/* Un cobro es del dueño, no de una sucursal: se
                            muestra la primera, la que nacio con la cuenta. */}
                        <p className="text-slate-800 font-medium">
                          {pago.studio_name ?? "—"}
                        </p>
                        <p className="text-slate-400 text-xs">
                          {pago.studio_id ? `#${pago.studio_id}` : "Sin estudio"}
                          {pago.sucursales > 1 &&
                            ` · ${pago.sucursales} sucursales`}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {pago.email ?? "—"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {pago.card_last4 ? (
                          <span className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md border border-line bg-surface text-xs font-medium text-slate-600">
                              {marca(pago.card_brand)}
                            </span>
                            <span className="text-slate-600">
                              •••• {pago.card_last4}
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-slate-600">
                          {pago.plan_name ?? "—"}
                          {pago.intervalo && (
                            <span className="text-slate-400">
                              {" "}
                              / {pago.intervalo}
                            </span>
                          )}
                        </p>
                        <p className="text-slate-400 text-xs">{pago.razon}</p>
                      </td>
                      <td className="px-6 py-4 text-slate-600 text-sm whitespace-nowrap">
                        {fechaHora(pago.pagado_en)}
                      </td>
                      <td className="px-6 py-4 text-slate-800 whitespace-nowrap">
                        {money(pago.amount_cents, pago.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-t border-slate-100">
              <p className="text-sm text-slate-500">
                {pagos.length} {pagos.length === 1 ? "cobro" : "cobros"} en esta
                página
              </p>

              {(indice > 0 || hasMore) && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => irA(Math.max(0, indice - 1))}
                    disabled={indice === 0 || loading}
                    aria-label="Página anterior"
                    className="flex items-center justify-center w-9 h-9 rounded-full border border-slate-200 text-slate-600 transition-colors cursor-pointer hover:border-[#1b2c44] hover:text-[#1b2c44] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:text-slate-600"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <p className="text-sm text-slate-600">Página {indice + 1}</p>
                  <button
                    onClick={() => irA(indice + 1)}
                    disabled={!hasMore || loading}
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

export default AdminPagos;
