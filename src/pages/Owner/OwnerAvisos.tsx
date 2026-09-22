import { useCallback, useEffect, useState } from "react";
import { Lock, Megaphone, Send, Users } from "lucide-react";
import { Link } from "react-router-dom";

import BranchTabs from "../../components/BranchTabs";
import { ApiError } from "../../lib/api";
import { useBranches } from "../../lib/branches";
import { fetchOwnerSubscription } from "../../lib/subscription";
import {
  NOTICE_MAX,
  fetchStudioNotices,
  noticeAgo,
  sendStudioNotice,
  type StudioNotice,
  type StudioNotices,
} from "../../lib/notices";

function OwnerAvisos() {
  // Los avisos son de una sucursal, como sus favoritos: al cambiar de
  // pestaña se piden los de la otra.
  const { branches, studio, activeId, setActiveId } = useBranches();
  const studioId = studio?.id ?? null;

  const [notices, setNotices] = useState<StudioNotice[]>([]);
  const [favorites, setFavorites] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // Mandar avisos es del plan Pro. El menu ya esconde la pestaña, pero la URL
  // se puede escribir a mano y el dueño que baja de plan puede tenerla
  // abierta: aqui se le explica en vez de dejarlo con una pantalla muerta.
  // null = todavia no se sabe.
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    fetchOwnerSubscription()
      .then((sub) => setAllowed(sub.notices === true))
      .catch(() => setAllowed(false));
  }, []);

  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const apply = useCallback((data: StudioNotices) => {
    setNotices(data.notices);
    setFavorites(data.favorites);
    setRemaining(data.remaining_today);
    setLoaded(true);
  }, []);

  const load = useCallback(() => {
    if (!studioId || !allowed) return;
    fetchStudioNotices(studioId).then(apply);
  }, [studioId, allowed, apply]);

  useEffect(load, [load]);

  const texto = body.trim();
  const sobra = texto.length > NOTICE_MAX;
  const sinCupo = remaining === 0 && loaded;

  const handleSend = async () => {
    if (!studioId || !texto || sobra) return;
    setSending(true);
    setError("");
    try {
      const aviso = await sendStudioNotice(studioId, texto);
      // El aviso recien mandado se pone hasta arriba sin volver a pedir la
      // lista; lo unico que cambia ademas es el cupo del dia.
      setNotices((prev) => [aviso, ...prev]);
      setRemaining((n) => Math.max(n - 1, 0));
      setBody("");
      setSent(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "No pudimos mandar el aviso",
      );
    } finally {
      setSending(false);
    }
  };

  const header = (
    <div className="mb-8">
      <h1
        className="text-4xl md:text-6xl font-semibold text-slate-800"
        style={{ fontFamily: "Cormorant Garamond, serif" }}
      >
        Mis <span className="text-ink">Avisos</span>
      </h1>
      <p className="text-slate-500 mt-2">
        Le llegan a los alumnos que tienen esta sucursal en favoritos, en su
        pestaña Notificaciones.
      </p>
    </div>
  );

  if (allowed === false) {
    return (
      <div className="p-4 md:p-8">
        {header}
        <div className="bg-white border border-line rounded-2xl p-10 text-center max-w-xl">
          <Lock size={28} className="mx-auto text-slate-400 mb-3" />
          <p className="text-slate-800 font-medium mb-1">
            Los avisos son del plan Pro
          </p>
          <p className="text-sm text-slate-500 mb-6">
            Con el plan Pro puedes mandarles un mensaje a los alumnos que tienen
            tu estudio en favoritos: un cambio de horario, una promoción o algo
            para animarlos.
          </p>
          <Link
            to="/owner/estudio/suscripcion"
            className="inline-block bg-ink text-white px-5 py-2.5 rounded-xl font-medium hover:bg-ink-soft transition-colors"
          >
            Ver planes
          </Link>
        </div>
      </div>
    );
  }

  if (!studioId || allowed === null) return null;

  return (
    <div className="p-4 md:p-8">
      {header}

      <div className="mb-6">
        <BranchTabs
          branches={branches}
          activeId={activeId}
          onSelect={setActiveId}
        />
      </div>

      {/* Nuevo aviso: hasta arriba, que es a lo que se entra a esta pantalla */}
      <div className="bg-white border border-line rounded-2xl p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Megaphone size={18} className="text-ink" />
          <h2 className="font-medium text-slate-800">Nuevo aviso</h2>
        </div>

        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value.slice(0, NOTICE_MAX));
            setSent(false);
            setError("");
          }}
          rows={4}
          maxLength={NOTICE_MAX}
          disabled={sinCupo}
          placeholder="Mañana la clase de las 7 se recorre a las 7:30. ¡Nos vemos!"
          className="w-full px-4 py-3 rounded-xl border border-line bg-surface text-sm outline-none focus:border-slate-400 transition-colors resize-none disabled:opacity-60"
        />

        <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
          <p className="text-sm text-slate-500 flex items-center gap-1.5">
            <Users size={15} className="text-slate-400" />
            {favorites === 0
              ? "Todavía nadie tiene esta sucursal en favoritos"
              : `Le llega a ${favorites} ${favorites === 1 ? "alumno" : "alumnos"}`}
          </p>
          <div className="flex items-center gap-4">
            <span
              className={`text-sm ${texto.length > NOTICE_MAX - 50 ? "text-amber-700" : "text-slate-400"}`}
            >
              {texto.length}/{NOTICE_MAX}
            </span>
            <button
              onClick={handleSend}
              disabled={!texto || sobra || sending || sinCupo}
              className="flex items-center gap-2 bg-ink text-white px-5 py-2.5 rounded-xl font-medium hover:bg-ink-soft transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send size={16} />
              {sending ? "Mandando…" : "Mandar aviso"}
            </button>
          </div>
        </div>

        {sinCupo && (
          <p className="text-sm text-amber-700 bg-[#faeeda] rounded-xl px-4 py-3 mt-4">
            Ya mandaste los avisos que caben en un día. Puedes seguir mañana:
            muchos seguidos hacen que te quiten de favoritos.
          </p>
        )}
        {!sinCupo && remaining <= 2 && loaded && (
          <p className="text-sm text-slate-500 mt-3">
            Te {remaining === 1 ? "queda" : "quedan"} {remaining} aviso
            {remaining === 1 ? "" : "s"} por hoy.
          </p>
        )}
        {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
        {sent && !error && (
          <p className="text-sm text-slate-500 mt-3">Aviso mandado.</p>
        )}
      </div>

      {/* Lo mandado. Se conserva un mes: mas atras ya no le sirve a nadie. */}
      <h2 className="font-medium text-slate-800 mb-4">Avisos del último mes</h2>

      {loaded && notices.length === 0 && (
        <div className="bg-white border border-dashed border-line rounded-2xl p-10 text-center">
          <Megaphone size={28} className="mx-auto text-slate-400 mb-3" />
          <p className="text-slate-800 font-medium mb-1">
            No has mandado avisos este mes
          </p>
          <p className="text-sm text-slate-500">
            Un cambio de horario, una promoción o un mensaje para animar a tus
            alumnos.
          </p>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {notices.map((aviso) => (
          <li
            key={aviso.id}
            className="bg-white border border-line rounded-2xl p-5"
          >
            <p className="text-slate-800 whitespace-pre-wrap">{aviso.body}</p>
            <p className="text-sm text-slate-400 mt-3">
              {new Date(aviso.created_at).toLocaleDateString("es-MX", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              · {noticeAgo(aviso.created_at)} · le llegó a {aviso.recipients}{" "}
              {aviso.recipients === 1 ? "alumno" : "alumnos"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default OwnerAvisos;
