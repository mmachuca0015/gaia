import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import {
  X,
  MapPin,
  Phone,
  Mail,
  CalendarDays,
  Users,
  Clock,
  Star,
} from "lucide-react";

export type StudioDetails = {
  studio: {
    id: number;
    name: string;
    description: string | null;
    street: string | null;
    ext_number: string | null;
    int_number: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    zip_code: string | null;
    phone: string | null;
    email: string | null;
    logo_url: string | null;
    cover_url: string | null;
    latitude: string | null;
    longitude: string | null;
    rating: string | null;
    is_active: boolean;
    is_open: boolean;
    created_at: string;
  };
  classes: {
    id: number;
    name: string;
    price: number;
    capacity: number;
    instructor: string | null;
    alumnos: string;
    horarios: { day: number; time: string }[];
  }[];
  instructors: {
    id: number;
    name: string;
    last_name: string;
    created_at: string;
  }[];
};

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function formatTime(time: string) {
  const [hours, minutes] = time.split(":");
  const h = parseInt(hours as string, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${minutes} ${ampm}`;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 0,
  }).format(price);
}

function formatCountry(country: string | null) {
  if (!country) return null;
  return country.toUpperCase() === "MX" ? "México" : country;
}

// Une las partes no vacías sin repetir (colonia y ciudad suelen venir iguales).
function joinParts(parts: (string | null)[], separator = ", ") {
  const clean = parts
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p));
  return [...new Set(clean)].join(separator);
}

function AdminStudioModal({
  details,
  onClose,
}: {
  details: StudioDetails;
  onClose: () => void;
}) {
  const { studio, classes, instructors } = details;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const lat = Number(studio.latitude);
  const lng = Number(studio.longitude);
  const hasMap = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0;

  const addressLine = joinParts([
    joinParts([studio.street, studio.ext_number], " "),
    studio.int_number ? `Int. ${studio.int_number}` : null,
  ]);
  const areaLine = joinParts([studio.neighborhood, studio.city, studio.state]);
  const regionLine = joinParts([
    studio.zip_code,
    formatCountry(studio.country),
  ]);

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Detalles de ${studio.name}`}
    >
      <div
        className="bg-[#f9f4ec] w-full max-w-5xl max-h-[90vh] rounded-3xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Portada */}
        <div className="relative h-40 shrink-0 bg-[#3a5a3a]">
          {studio.cover_url && (
            <img
              src={studio.cover_url}
              alt=""
              className="w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-stone-900/80 to-stone-900/10" />

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/90 text-stone-700 flex items-center justify-center transition-colors cursor-pointer hover:bg-white"
          >
            <X size={18} />
          </button>

          <div className="absolute bottom-4 left-6 right-6 flex items-end gap-4">
            {studio.logo_url && (
              <img
                src={studio.logo_url}
                alt=""
                className="w-16 h-16 rounded-2xl object-cover border-2 border-white/80 shrink-0"
              />
            )}
            <div className="min-w-0">
              <h2
                className="text-3xl md:text-4xl font-semibold text-white truncate"
                style={{ fontFamily: "Cormorant Garamond, serif" }}
              >
                {studio.name}
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {studio.rating && (
                  <span className="flex items-center gap-1 text-sm text-white/90">
                    <Star size={14} className="fill-white/90" />
                    {Number(studio.rating).toFixed(1)}
                  </span>
                )}
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/90 text-stone-700">
                  {studio.is_active ? "Activo" : "Inactivo"}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/90 text-stone-700">
                  {studio.is_open ? "Abierto" : "Cerrado"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Contenido */}
        <div className="overflow-y-auto p-6 grid gap-6 lg:grid-cols-3">
          {/* Clases */}
          <section className="lg:col-span-2 order-2 lg:order-1">
            <h3 className="text-sm font-semibold text-stone-600 mb-3 flex items-center gap-2">
              Clases
              <span className="text-stone-400 font-normal">
                ({classes.length})
              </span>
            </h3>

            {classes.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-stone-500 text-sm">
                Este estudio todavía no tiene clases
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {classes.map((clase) => {
                  const alumnos = Number(clase.alumnos);
                  const ocupacion = clase.capacity
                    ? Math.min(100, (alumnos / clase.capacity) * 100)
                    : 0;

                  return (
                    <div key={clase.id} className="bg-white rounded-2xl p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-stone-800 font-medium">
                            {clase.name}
                          </p>
                          <p className="text-sm text-stone-500 mt-0.5">
                            {clase.instructor ?? "Sin instructor asignado"}
                          </p>
                        </div>
                        <p className="text-lg font-semibold text-[#3a5a3a] whitespace-nowrap">
                          {formatPrice(clase.price)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 mt-4">
                        <Users size={14} className="text-stone-400 shrink-0" />
                        <span className="text-sm text-stone-600 whitespace-nowrap">
                          {alumnos} / {clase.capacity} alumnos
                        </span>
                        <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden ml-1">
                          <div
                            className="h-full bg-[#3a5a3a] rounded-full"
                            style={{ width: `${ocupacion}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 mt-3">
                        {clase.horarios.length === 0 ? (
                          <span className="text-xs text-stone-400">
                            Sin horarios asignados
                          </span>
                        ) : (
                          [...clase.horarios]
                            .sort(
                              (a, b) =>
                                a.day - b.day || a.time.localeCompare(b.time),
                            )
                            .map((horario) => (
                              <span
                                key={`${horario.day}-${horario.time}`}
                                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-[#f1ece2] text-stone-600"
                              >
                                <Clock size={12} className="text-stone-400" />
                                {DAYS[horario.day]} · {formatTime(horario.time)}
                              </span>
                            ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Información general, mapa e instructores */}
          <aside className="flex flex-col gap-6 order-1 lg:order-2">
            <section>
              <h3 className="text-sm font-semibold text-stone-600 mb-3">
                Información general
              </h3>
              <div className="bg-white rounded-2xl p-5 flex flex-col gap-4">
                {studio.description && (
                  <p className="text-sm text-stone-600 leading-relaxed">
                    {studio.description}
                  </p>
                )}

                <div className="flex gap-3">
                  <MapPin
                    size={16}
                    className="text-stone-400 shrink-0 mt-0.5"
                  />
                  <div className="text-sm text-stone-600">
                    {addressLine && <p>{addressLine}</p>}
                    {areaLine && <p>{areaLine}</p>}
                    {regionLine && <p>{regionLine}</p>}
                    {!addressLine && !areaLine && !regionLine && (
                      <p className="text-stone-400">Sin dirección registrada</p>
                    )}
                  </div>
                </div>

                {studio.phone && (
                  <div className="flex items-center gap-3 text-sm text-stone-600">
                    <Phone size={16} className="text-stone-400 shrink-0" />
                    {studio.phone}
                  </div>
                )}

                {studio.email && (
                  <div className="flex items-center gap-3 text-sm text-stone-600 break-all">
                    <Mail size={16} className="text-stone-400 shrink-0" />
                    {studio.email}
                  </div>
                )}

                <div className="flex items-center gap-3 text-sm text-stone-600 pt-1 border-t border-stone-100">
                  <CalendarDays size={16} className="text-stone-400 shrink-0" />
                  <span className="pt-3">
                    Dado de alta el {formatDate(studio.created_at)}
                  </span>
                </div>
              </div>
            </section>

            {hasMap && (
              <section>
                <h3 className="text-sm font-semibold text-stone-600 mb-3">
                  Ubicación
                </h3>
                <MapContainer
                  center={[lat, lng]}
                  zoom={15}
                  className="w-full h-48 rounded-2xl z-0"
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <Marker position={[lat, lng]}>
                    <Popup>{studio.name}</Popup>
                  </Marker>
                </MapContainer>
              </section>
            )}

            <section>
              <h3 className="text-sm font-semibold text-stone-600 mb-3 flex items-center gap-2">
                Instructores
                <span className="text-stone-400 font-normal">
                  ({instructors.length})
                </span>
              </h3>

              {instructors.length === 0 ? (
                <div className="bg-white rounded-2xl p-6 text-center text-stone-500 text-sm">
                  Sin instructores registrados
                </div>
              ) : (
                <div className="bg-white rounded-2xl p-2 flex flex-col">
                  {instructors.map((instructor) => (
                    <div
                      key={instructor.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-stone-50 transition-colors"
                    >
                      <span className="w-9 h-9 rounded-full bg-[#3a5a3a]/10 text-[#3a5a3a] text-xs font-medium flex items-center justify-center shrink-0">
                        {instructor.name[0]}
                        {instructor.last_name?.[0]}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm text-stone-800 font-medium truncate">
                          {instructor.name} {instructor.last_name}
                        </p>
                        <p className="text-xs text-stone-500">
                          Desde {formatDate(instructor.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default AdminStudioModal;
