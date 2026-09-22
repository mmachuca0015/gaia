import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "react-router-dom";

import {
  fetchNotifications,
  markNoticesSeen,
  noticeAgo,
  noticesChanged,
  type Notification,
} from "../../lib/notices";

function Notificaciones() {
  const [notices, setNotices] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchNotifications().then((data) => {
      if (cancelled) return;
      setNotices(data.notices);
      setLoaded(true);
      // Se marcan como vistos DESPUES de traerlos, no antes: asi esta visita
      // todavia enseña cuales eran nuevos y la siguiente ya no. Al terminar se
      // avisa al menu, para que el punto rojo se apague aqui mismo y no al
      // minuto siguiente.
      if (data.unread > 0) {
        markNoticesSeen()
          .then(noticesChanged)
          .catch(() => {});
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="p-4 md:p-8">
      <div className="mb-10">
        <h1
          className="text-4xl md:text-6xl font-semibold text-slate-800"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Tus <span className="text-[#1b2c44]">notificaciones</span>
        </h1>
        <p className="text-slate-500 mt-2">
          Lo que mandan los estudios que tienes en favoritos.
        </p>
      </div>

      {loaded && notices.length === 0 && (
        <div className="bg-white border border-dashed border-line rounded-2xl p-10 text-center">
          <Bell size={28} className="mx-auto text-slate-400 mb-3" />
          <p className="text-slate-800 font-medium mb-1">
            Todavía no tienes avisos
          </p>
          <p className="text-sm text-slate-500">
            Aquí te llegan los de tus estudios favoritos.{" "}
            <Link to="/explorar" className="text-ink underline">
              Explora estudios
            </Link>
          </p>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {notices.map((aviso) => (
          <li
            key={aviso.id}
            className={`rounded-2xl p-5 border transition-colors ${
              aviso.unread
                ? "bg-white border-ink/25"
                : "bg-white border-line opacity-80"
            }`}
          >
            <div className="flex items-start gap-4">
              {aviso.logo_url ? (
                <img
                  src={aviso.logo_url}
                  alt={aviso.studio_name}
                  className="w-11 h-11 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-surface border border-line flex items-center justify-center shrink-0">
                  <Bell size={16} className="text-slate-400" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    to={`/studios/${aviso.studio_id}`}
                    className="font-medium text-slate-800 hover:text-ink transition-colors"
                  >
                    {aviso.studio_name}
                  </Link>
                  {aviso.unread && (
                    <span className="w-1.5 h-1.5 rounded-full bg-ink" />
                  )}
                  <span className="text-sm text-slate-400">
                    {noticeAgo(aviso.created_at)}
                  </span>
                </div>
                <p className="text-slate-700 mt-1 whitespace-pre-wrap break-words">
                  {aviso.body}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Notificaciones;
