// Ubicacion del alumno y distancia a los estudios.
//
// La ubicacion se pide al navegador (el alumno tiene que dar permiso) y nunca
// se manda al backend: la distancia se calcula aqui, con las coordenadas que
// cada estudio ya trae.

export interface Coords {
  lat: number;
  lng: number;
}

const CACHE_KEY = "wellco_location";
// Una ubicacion de hace media hora sigue sirviendo para ordenar estudios, y
// evita pedirla en cada pantalla.
const MAX_AGE_MS = 30 * 60 * 1000;

let pending: Promise<Coords> | null = null;

function readCache(): Coords | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { lat, lng, at } = JSON.parse(raw);
    return Date.now() - at < MAX_AGE_MS ? { lat, lng } : null;
  } catch {
    return null;
  }
}

function writeCache(coords: Coords) {
  try {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ ...coords, at: Date.now() }),
    );
  } catch {
    // Sin almacenamiento (ventana privada): solo se vuelve a pedir.
  }
}

/** Ubicacion ya conocida, sin pedir permiso. Null si no hay. */
export function cachedUserLocation(): Coords | null {
  return readCache();
}

/** Pide la ubicacion. Falla si el alumno no da permiso o no se puede obtener. */
export function getUserLocation(): Promise<Coords> {
  const cached = readCache();
  if (cached) return Promise.resolve(cached);
  if (pending) return pending;

  pending = new Promise<Coords>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("sin geolocalizacion"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        writeCache(coords);
        resolve(coords);
      },
      reject,
      { enableHighAccuracy: false, timeout: 10000, maximumAge: MAX_AGE_MS },
    );
  }).finally(() => {
    pending = null;
  });
  return pending;
}

/**
 * Distancia en km en linea recta (formula de haversine). No es la ruta en
 * coche, pero sirve para ordenar y dar una idea de que tan lejos esta.
 */
export function distanceKm(
  from: Coords,
  lat: number | string | null | undefined,
  lng: number | string | null | undefined,
): number | null {
  const toLat = Number(lat);
  const toLng = Number(lng);
  if (
    lat == null ||
    lng == null ||
    !Number.isFinite(toLat) ||
    !Number.isFinite(toLng)
  ) {
    return null;
  }
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(toLat - from.lat);
  const dLng = rad(toLng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(from.lat)) * Math.cos(rad(toLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** "850 m", "3.2 km", "24 km". */
export function formatDistance(km: number) {
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
