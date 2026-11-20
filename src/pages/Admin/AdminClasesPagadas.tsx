import { useEffect, useState } from "react";
import {
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
} from "lucide-react";

import { api, apiJson, ApiError } from "../../lib/api";
import AdminSearch from "../../components/AdminSearch";

/* Clases pagadas (GET /admin/clases-pagadas): un renglon por PAGO, cada
   reserva cobrada con tarjeta. Las reservadas con paquete no van: su cobro
   fue al comprar el paquete.

   Reembolsar (POST /admin/bookings/:id/refund, services/adminRefund.js) es
   para cuando hubo un problema con el estudio: al alumno se le devuelve el
   precio (sin el 3% de servicio) y al estudio se le recupera todo lo que
   recibio por esa reserva. Les llega correo a los dos. */

type Status = "activa" | "pasada" | "reembolsada" | "reubicada";

type Pago = {
  booking_id: number;
  status: Status;
  /** pi_... del cobro en Stripe. NULL en reservas viejas o demo. */
  payment_intent_id: string | null;
  price_cents: number | null;
  service_fee_cents: number | null;
  class_name: string;
  studio_id: number;
  studio_name: string;
  is_demo: boolean;
  user_id: number;
  name: string;
  last_name: string;
  email: string;
  refund_cents: number | null;
  refund_recovered_cents: number | null;
  refund_status: "hecho" | "sin_cargo" | "sin_fondos" | "en_proceso" | null;
  refund_reason: string | null;
  /** "2026-11-21T10:05", hora de Mexico. */
  refunded_at: string | null;
  class_date: string | null;
  time: string | null;
  paid_at: string;
  ya_paso: boolean;
  card: { brand: string; last4: string } | null;
  /** Por que no se puede reembolsar; null si se puede. */
  refund_blocked: string | null;
};

type Cuando = "todas" | "proximas" | "pasadas";

const CUANDO_LABEL: Record<Cuando, string> = {
  todas: "Todas",
  proximas: "Próximas",
  pasadas: "Pasadas",
};

const PER_PAGE = 25;
const REASON_MAX = 500;

const BRANDS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
};

function money(cents: number | null) {
  if (cents === null) return "—";
  return `$${(cents / 100).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

function cobrado(p: Pago) {
  if (p.price_cents === null) return null;
  return p.price_cents + (p.service_fee_cents ?? 0);
}

/** El id del cobro, con boton de copiar y enlace al pago en Stripe. */
function PaymentId({ id }: { id: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!id) return <span className="text-slate-400">—</span>;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Sin permiso de portapapeles: el id se puede seleccionar a mano.
    }
  };
  return (
    <span className="flex items-center gap-1.5">
      <code className="text-xs text-slate-600 select-all">{id}</code>
      <button
        onClick={copy}
        aria-label="Copiar id del cobro"
        title="Copiar"
        className="text-slate-400 hover:text-ink cursor-pointer"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
      <a
        href={`https://dashboard.stripe.com/payments/${id}`}
        target="_blank"
        rel="noreferrer"
        aria-label="Abrir el cobro en Stripe"
        title="Abrir en Stripe"
        className="text-slate-400 hover:text-ink"
      >
        <ExternalLink size={14} />
      </a>
    </span>
  );
}

function StatusCell({ p, onRefund }: { p: Pago; onRefund: () => void }) {
  if (p.status === "reembolsada") {
    return (
      <div>
        <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 whitespace-nowrap">
          Reembolsada {money(p.refund_cents)}
        </span>
        {p.refunded_at && (
          <p className="text-xs text-slate-400 mt-1">
            {formatDateTime(p.refunded_at)}
          </p>
        )}
      </div>
    );
  }
  if (p.status === "reubicada") {
    return (
      <span
        className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 whitespace-nowrap"
        title="La sucursal se durmió y se le abonó la clase en otra"
      >
        Reubicada
      </span>
    );
  }
  if (p.refund_blocked) {
    return (
      <span
        className="text-xs text-slate-400"
        title={p.refund_blocked}
      >
        No reembolsable
      </span>
    );
  }
  return (
    <button
      onClick={onRefund}
      className="text-sm px-3 py-1.5 rounded-full border border-red-200 text-red-600 hover:bg-red-50 transition-colors cursor-pointer whitespace-nowrap"
    >
      Reembolsar
    </button>
  );
}

function RefundModal({
  pago,
  onClose,
  onDone,
}: {
  pago: Pago;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const confirmar = async () => {
    setSending(true);
    setError("");
    try {
      const r = await apiJson<{
        refunded_cents: number;
        recovered_cents: number;
        warning: string | null;
      }>(`/admin/bookings/${pago.booking_id}/refund`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      onDone(
        r.warning ??
          `Se reembolsaron ${money(r.refunded_cents)} a ${pago.name} y se le descontaron ${money(r.recovered_cents)} al estudio. Les avisamos por correo.`,
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "No pudimos hacer el reembolso",
      );
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 md:p-8 w-full max-w-md flex flex-col gap-4">
        <p className="font-semibold text-slate-800 text-lg">
          Reembolsar clase
        </p>

        <div className="bg-surface rounded-xl p-4 text-sm text-slate-600 flex flex-col gap-1">
          <p>
            <span className="text-slate-400">Alumno:</span>{" "}
            {pago.name} {pago.last_name}
          </p>
          <p>
            <span className="text-slate-400">Clase:</span> {pago.class_name} ·{" "}
            {pago.studio_name}
          </p>
          <p>
            <span className="text-slate-400">Fecha:</span>{" "}
            {formatDate(pago.class_date)}
            {pago.time ? `, ${pago.time}` : ""}
          </p>
          {pago.card && (
            <p>
              <span className="text-slate-400">Tarjeta:</span>{" "}
              {BRANDS[pago.card.brand] ?? pago.card.brand} ···{pago.card.last4}
            </p>
          )}
        </div>

        <div className="text-sm text-slate-600 flex flex-col gap-1.5">
          <p>
            Al alumno se le devuelven{" "}
            <strong className="text-ink">{money(pago.price_cents)}</strong>, el
            precio de la clase. El cargo por servicio de{" "}
            {money(pago.service_fee_cents)} no se devuelve.
          </p>
          <p>
            Al estudio se le descuenta <strong>todo lo que recibió</strong> por
            esta reserva.
          </p>
          <p className="text-slate-400 text-xs">
            Los dos reciben correo. La reserva se cancela y libera su lugar.
          </p>
        </div>

        <label className="text-sm text-slate-600">
          <span className="block mb-1.5">
            Motivo <span className="text-slate-400">(opcional, va en el correo al estudio)</span>
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX))}
            rows={3}
            placeholder="Ej. El estudio canceló la clase sin avisar"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-slate-400 transition-colors resize-none"
          />
          <span className="block text-right text-xs text-slate-400">
            {reason.length}/{REASON_MAX}
          </span>
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={sending}
            className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-md hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={sending}
            className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-md hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? "Reembolsando…" : `Reembolsar ${money(pago.price_cents)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminClasesPagadas() {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [cuando, setCuando] = useState<Cuando>("todas");
  const [query, setQuery] = useState("");
  // Sube tras un reembolso para volver a pedir la pagina.
  const [reloads, setReloads] = useState(0);

  const [refunding, setRefunding] = useState<Pago | null>(null);
  const [notice, setNotice] = useState("");

  // `loading` es derivado, como en el resto del panel: mientras lo cargado no
  // sea lo que se pide, estamos esperando.
  const [loadedKey, setLoadedKey] = useState("");
  const pedido = `${page}-${cuando}-${query}-${reloads}`;
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
        setPagos(data.pagos ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(`${page}-${cuando}-${query}-${reloads}`);
      });
    return () => {
      cancelled = true;
    };
  }, [page, cuando, query, reloads]);

  const from = total === 0 ? 0 : (page - 1) * PER_PAGE + 1;
  const to = Math.min(page * PER_PAGE, total);

  const th = "text-left px-4 py-4 text-sm font-semibold text-slate-600 whitespace-nowrap";

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
          {total} {total === 1 ? "pago" : "pagos"} con tarjeta
        </p>
      </div>

      {notice && (
        <div className="mb-4 flex items-start justify-between gap-3 text-sm text-ink bg-ink/5 rounded-xl px-4 py-3">
          <p>{notice}</p>
          <button
            onClick={() => setNotice("")}
            className="text-slate-400 hover:text-ink cursor-pointer"
            aria-label="Cerrar aviso"
          >
            ×
          </button>
        </div>
      )}

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
          placeholder="Buscar alumno, clase, estudio o pi_…"
          onSearch={(q) => {
            setQuery(q);
            setPage(1);
          }}
        />
      </div>

      <div className="bg-white rounded-2xl overflow-hidden">
        {loading && pagos.length === 0 ? (
          <div className="p-10 text-center text-slate-500">Cargando...</div>
        ) : pagos.length === 0 ? (
          <div className="p-10 flex flex-col items-center gap-4 text-center">
            <CalendarCheck size={36} className="text-slate-300" />
            <p className="text-slate-600 font-medium">
              {query
                ? "Ningún pago coincide con la búsqueda"
                : "Todavía no hay clases pagadas"}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className={th}>Quién pagó</th>
                    <th className={th}>Clase · Estudio</th>
                    <th className={th}>Fecha de la clase</th>
                    <th className={th}>Pagado el</th>
                    <th className={th}>Tarjeta</th>
                    <th className={`${th} text-right`}>Precio</th>
                    <th
                      className={`${th} text-right`}
                      title="Precio + cargo por servicio"
                    >
                      Cobrado
                    </th>
                    <th className={th}>ID del cobro</th>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody
                  className={`transition-opacity ${loading ? "opacity-40" : ""}`}
                >
                  {pagos.map((p) => (
                    <tr
                      key={p.booking_id}
                      className="border-b border-slate-50 last:border-0 align-top"
                    >
                      <td className="px-4 py-4">
                        <p className="text-slate-800 font-medium whitespace-nowrap">
                          {p.name} {p.last_name}
                        </p>
                        <p className="text-slate-400 text-xs">{p.email}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-slate-800 whitespace-nowrap">
                          {p.class_name}
                        </p>
                        <p className="text-slate-500 text-xs flex items-center gap-2 whitespace-nowrap">
                          {p.studio_name}
                          {p.is_demo && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs">
                              Demo
                            </span>
                          )}
                        </p>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <p className="text-slate-800">
                          {formatDate(p.class_date)}
                        </p>
                        <p className="text-slate-500 text-xs flex items-center gap-2">
                          {p.time ?? "—"}
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs ${
                              p.ya_paso
                                ? "bg-slate-100 text-slate-500"
                                : "bg-[#1b2c44]/10 text-[#1b2c44]"
                            }`}
                          >
                            {p.ya_paso ? "Pasada" : "Próxima"}
                          </span>
                        </p>
                      </td>
                      <td className="px-4 py-4 text-slate-600 whitespace-nowrap">
                        {formatDateTime(p.paid_at)}
                      </td>
                      <td className="px-4 py-4 text-slate-600 whitespace-nowrap">
                        {p.card
                          ? `${BRANDS[p.card.brand] ?? p.card.brand} ···${p.card.last4}`
                          : "—"}
                      </td>
                      <td className="px-4 py-4 text-right text-slate-600 whitespace-nowrap">
                        {money(p.price_cents)}
                      </td>
                      <td className="px-4 py-4 text-right text-slate-800 font-medium whitespace-nowrap">
                        {money(cobrado(p))}
                      </td>
                      <td className="px-4 py-4">
                        <PaymentId id={p.payment_intent_id} />
                        <p className="text-slate-400 text-xs mt-0.5">
                          Reserva #{p.booking_id}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <StatusCell p={p} onRefund={() => setRefunding(p)} />
                      </td>
                    </tr>
                  ))}
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

      {refunding && (
        <RefundModal
          pago={refunding}
          onClose={() => setRefunding(null)}
          onDone={(message) => {
            setRefunding(null);
            setNotice(message);
            setReloads((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}

export default AdminClasesPagadas;
