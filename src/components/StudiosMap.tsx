import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { useNavigate } from "react-router-dom";

import type { Coords } from "../lib/location";

export type MapStudio = {
  id: number;
  name: string;
  logo_url: string | null;
  cover_url: string | null;
  min_price: number | null;
  neighborhood: string;
  open_now?: boolean;
  latitude: string | number | null;
  longitude: string | number | null;
};

type Located = MapStudio & { position: [number, number] };

// Guadalajara: el centro cuando no hay estudios con ubicacion ni la del alumno.
const FALLBACK_CENTER: [number, number] = [20.6767, -103.3475];

// Tiempo de gracia al sacar el mouse del pin: lo justo para llegar a la
// tarjeta y darle a "Ver más" sin que se cierre en el camino.
const HIDE_DELAY_MS = 250;

// Pin propio en vez del icono por defecto de Leaflet: con Vite las imagenes
// del icono no se resuelven y el pin sale roto. Ademas va con el color de la
// marca.
function pinIcon(active: boolean) {
  const fill = active ? "#33506f" : "#1b2c44";
  return L.divIcon({
    className: "",
    html: `<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 3px rgba(27,44,68,.35))">
      <path d="M15 0C6.7 0 0 6.6 0 14.8 0 25.9 15 40 15 40s15-14.1 15-25.2C30 6.6 23.3 0 15 0z" fill="${fill}"/>
      <circle cx="15" cy="14.5" r="5.5" fill="#fff"/>
    </svg>`,
    iconSize: [30, 40],
    iconAnchor: [15, 40],
    popupAnchor: [0, -38],
  });
}
const PIN = pinIcon(false);
const PIN_ACTIVE = pinIcon(true);

function toNumber(v: string | number | null) {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return n != null && Number.isFinite(n) && n !== 0 ? n : null;
}

/** Encuadra todos los pines al cargar (o al cambiar la busqueda). */
function FitToStudios({
  points,
  user,
}: {
  points: [number, number][];
  user: Coords | null;
}) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join("|");
  useEffect(() => {
    if (points.length === 0) {
      if (user) map.setView([user.lat, user.lng], 13);
      return;
    }
    if (points.length === 1) {
      map.setView(points[0]!, 15);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 });
    // `key` resume `points`: con el arreglo cada render volveria a encuadrar
    // y el alumno no podria mover el mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

/** Un clic en el mapa (fuera de un pin o tarjeta) suelta la tarjeta fija. */
function UnpinOnMapClick({ onClick }: { onClick: () => void }) {
  useMapEvents({ click: onClick });
  return null;
}

function StudioMapCard({
  studio,
  onEnter,
  onLeave,
}: {
  studio: Located;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="w-64 bg-white"
      style={{ fontFamily: "Jost, system-ui, sans-serif" }}
    >
      {/* Portada. Sin foto queda un degradado suave de la paleta, no un
          hueco gris. */}
      <div className="relative h-28">
        {studio.cover_url ? (
          <img
            src={studio.cover_url}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-linear-to-br from-surface to-[#e3eaf3]" />
        )}
        {studio.open_now != null && (
          <span
            className={`absolute top-2.5 right-2.5 text-[11px] px-2.5 py-0.5 rounded-full font-medium bg-white/95 ${
              studio.open_now ? "text-ink" : "text-slate-400"
            }`}
          >
            {studio.open_now ? "Abierto" : "Cerrado"}
          </span>
        )}

        {/* Foto de perfil encimada sobre el borde de la portada */}
        <div className="absolute -bottom-7 left-4 w-14 h-14 rounded-full ring-4 ring-white bg-white overflow-hidden shadow-sm">
          {studio.logo_url ? (
            <img
              src={studio.logo_url}
              alt={studio.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-white border border-line rounded-full flex items-center justify-center text-ink text-xl font-semibold">
              {studio.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pt-9 pb-4">
        <p className="font-semibold text-slate-800 text-base leading-tight truncate !m-0">
          {studio.name}
        </p>
        {studio.neighborhood && (
          <p className="text-xs text-slate-500 !mt-0.5 !mb-0 truncate">
            {studio.neighborhood}
          </p>
        )}

        <div className="flex items-baseline gap-1 !mt-3 !mb-3">
          {studio.min_price != null ? (
            <>
              <span className="text-xs text-slate-500">Clases desde</span>
              <span className="text-lg font-semibold text-ink">
                ${studio.min_price}
              </span>
            </>
          ) : (
            <span className="text-sm text-slate-500">Sin clases todavía</span>
          )}
        </div>

        <button
          onClick={() => navigate(`/studios/${studio.id}`)}
          className="w-full bg-ink text-white text-sm font-medium py-2.5 rounded-xl hover:bg-ink-soft transition-colors cursor-pointer"
        >
          Ver más
        </button>
      </div>
    </div>
  );
}

/**
 * Mapa con un pin por estudio. Pasar el mouse muestra su tarjeta; un clic la
 * deja fija hasta que se haga clic en otro pin o en el mapa. En el celular
 * no hay hover, asi que tocar el pin la fija directamente.
 */
export default function StudiosMap({
  studios,
  userCoords,
}: {
  studios: MapStudio[];
  userCoords: Coords | null;
}) {
  const located = useMemo<Located[]>(
    () =>
      studios.flatMap((s) => {
        const lat = toNumber(s.latitude);
        const lng = toNumber(s.longitude);
        return lat != null && lng != null
          ? [{ ...s, position: [lat, lng] as [number, number] }]
          : [];
      }),
    [studios],
  );

  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [pinnedId, setPinnedId] = useState<number | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);

  const cancelHide = () => window.clearTimeout(hideTimer.current);
  const scheduleHide = () => {
    cancelHide();
    hideTimer.current = window.setTimeout(
      () => setHoveredId(null),
      HIDE_DELAY_MS,
    );
  };
  useEffect(() => cancelHide, []);

  // Fija gana: con una tarjeta fija, pasar por otro pin no la reemplaza.
  const activeId = pinnedId ?? hoveredId;
  const active = located.find((s) => s.id === activeId) ?? null;

  const center: [number, number] =
    located[0]?.position ??
    (userCoords ? [userCoords.lat, userCoords.lng] : FALLBACK_CENTER);

  return (
    <div className="relative">
      <MapContainer
        center={center}
        zoom={13}
        className="w-full h-[70vh] min-h-[420px] rounded-2xl z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitToStudios
          points={located.map((s) => s.position)}
          user={userCoords}
        />
        <UnpinOnMapClick
          onClick={() => {
            setPinnedId(null);
            setHoveredId(null);
          }}
        />

        {located.map((s) => (
          <Marker
            key={s.id}
            position={s.position}
            icon={s.id === activeId ? PIN_ACTIVE : PIN}
            eventHandlers={{
              mouseover: () => {
                cancelHide();
                setHoveredId(s.id);
              },
              mouseout: scheduleHide,
              click: () => {
                cancelHide();
                setHoveredId(s.id);
                setPinnedId((id) => (id === s.id ? null : s.id));
              },
            }}
          />
        ))}

        {active && (
          <Popup
            // La key cambia al fijarla: autoPan solo se aplica al abrir, y
            // mover el mapa en un simple hover seria molesto.
            key={`${active.id}-${pinnedId === active.id}`}
            position={active.position}
            offset={[0, -36]}
            closeButton={false}
            autoPan={pinnedId === active.id}
            closeOnClick={false}
            // Sin el margen que Leaflet le pone al contenido, para que la
            // portada llegue a las orillas (estilos en index.css).
            className="studio-map-popup"
          >
            <StudioMapCard
              studio={active}
              onEnter={cancelHide}
              onLeave={() => {
                if (pinnedId !== active.id) scheduleHide();
              }}
            />
          </Popup>
        )}
      </MapContainer>

      {located.length < studios.length && (
        <p className="text-xs text-slate-400 mt-2">
          {studios.length - located.length === 1
            ? "1 estudio no tiene ubicación todavía y no sale en el mapa."
            : `${studios.length - located.length} estudios no tienen ubicación todavía y no salen en el mapa.`}
        </p>
      )}
    </div>
  );
}
