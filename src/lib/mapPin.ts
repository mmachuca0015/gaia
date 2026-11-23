import L from "leaflet";

// Pin propio en vez del icono por defecto de Leaflet: con Vite las imagenes
// del icono (marker-icon.png) no se resuelven y el pin sale roto, un cuadro
// con signo de interrogacion. Ademas va con el color de la marca.
export function pinIcon(active: boolean) {
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

export const PIN = pinIcon(false);
export const PIN_ACTIVE = pinIcon(true);

// Icono por defecto de todos los <Marker> de la app (se importa en main.tsx).
// Asi un mapa nuevo no puede volver a salir con el pin roto por olvidar pasar
// `icon`.
L.Marker.prototype.options.icon = PIN;
