// Avisos del estudio: los manda el dueño desde /owner/avisos y le llegan al
// alumno en /notificaciones, si tiene esa sucursal en favoritos.
import { useEffect, useState } from "react";

import { apiJson } from "./api";

/**
 * Maximo de caracteres de un aviso. El backend lo vuelve a comprobar (y la
 * tabla tiene el mismo CHECK): esto es solo el contador de la pantalla.
 */
export const NOTICE_MAX = 500;

/** Lo que el dueño ve de un aviso suyo. */
export interface StudioNotice {
  id: number;
  body: string;
  /** A cuantos favoritos les llego, contados al mandarlo. */
  recipients: number;
  created_at: string;
}

/** GET /studios/:id/avisos */
export interface StudioNotices {
  notices: StudioNotice[];
  /** Cuantos alumnos tienen la sucursal en favoritos ahora. */
  favorites: number;
  /** Cuantos avisos mas puede mandar hoy. */
  remaining_today: number;
  max_length: number;
  /** Cuantos dias se conservan a la vista. */
  days: number;
}

/** Lo que el alumno ve en su pestaña Notificaciones. */
export interface Notification {
  id: number;
  body: string;
  created_at: string;
  studio_id: number;
  studio_name: string;
  logo_url: string | null;
  unread: boolean;
}

export function fetchStudioNotices(studioId: number) {
  return apiJson<StudioNotices>(`/studios/${studioId}/avisos`);
}

export function sendStudioNotice(studioId: number, body: string) {
  return apiJson<StudioNotice>(`/studios/${studioId}/avisos`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function fetchNotifications() {
  return apiJson<{ notices: Notification[]; unread: number }>(
    "/notificaciones",
  );
}

export function markNoticesSeen() {
  return apiJson<{ success: true }>("/notificaciones/vistos", {
    method: "POST",
  });
}

/** "hace 5 min", "hace 3 h", "ayer", "12 sep". */
export function noticeAgo(iso: string) {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return "ahora";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return "ayer";
  if (dias < 7) return `hace ${dias} días`;
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
  });
}

/** Cada cuanto se vuelve a preguntar si hay avisos nuevos. */
const POLL_MS = 60_000;

/**
 * Evento propio para que el punto se apague en cuanto el alumno abre
 * Notificaciones, sin esperar al siguiente sondeo. El proyecto no usa ninguna
 * libreria de estado global, y esto es un aviso de "ya cambio", no un estado
 * que haya que guardar en dos lados.
 */
const CHANGED = "wellco:avisos";

export function noticesChanged() {
  window.dispatchEvent(new Event(CHANGED));
}

/**
 * Cuantos avisos sin ver, para el punto rojo del menu. Lo usan el sidebar y la
 * barra de abajo, que se pintan en todas las pantallas del alumno.
 *
 * Se vuelve a preguntar en cuatro momentos, y no solo al cambiar de pantalla:
 * el alumno que se queda quieto en Explorar tambien se tiene que enterar.
 *   - al entrar a cada pantalla (`pathname`),
 *   - cada minuto, el mismo ritmo con que se refresca el panel del dueño,
 *   - al volver a la pestaña del navegador, que es cuando de verdad mira,
 *   - cuando la app avisa que algo cambio (`noticesChanged`).
 *
 * Con la pestaña en segundo plano no se pregunta nada: seria gastar peticiones
 * en alguien que no esta viendo. Al volver se pide de inmediato.
 */
export function useUnreadNotices(pathname: string) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      if (document.hidden) return;
      apiJson<{ unread: number }>("/notificaciones/unread")
        .then((data) => {
          if (!cancelled) setUnread(data.unread);
        })
        // Un 401 ya manda al login desde `api`; cualquier otro fallo solo
        // significa quedarse sin punto, no romper el menu.
        .catch(() => {});
    };

    load();
    const timer = setInterval(load, POLL_MS);
    document.addEventListener("visibilitychange", load);
    window.addEventListener(CHANGED, load);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
      window.removeEventListener(CHANGED, load);
    };
  }, [pathname]);

  return unread;
}
