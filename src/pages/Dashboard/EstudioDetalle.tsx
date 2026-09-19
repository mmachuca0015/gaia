import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import {
  MapPin,
  ArrowLeft,
  Heart,
  Phone,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import ClassCard from "../../components/ClassCard";
import StudioPackages from "../../components/StudioPackages";
import ShareStudioButton from "../../components/ShareStudioButton";
import {
  distanceKm,
  formatDistance,
  getUserLocation,
  type Coords,
} from "../../lib/location";

import { api } from "../../lib/api";
function EstudioDetalle() {
  const navigate = useNavigate();
  const { id } = useParams();
  const tabs = ["Clases", "Paquetes", "Detalles"];

  type Step = "Clases" | "Paquetes" | "Detalles";
  const [step, setStep] = useState<Step>("Clases");

  type Studio = {
    id: number;
    name: string;
    street: string;
    cover_url: string;
    is_open: boolean;
    rating: number;
    price_from: number;
    neighborhood: string;
    latitude: number;
    longitude: number;
    description: string;
    ext_number: string;
    int_number: string;
    city: string;
    state: string;
    country: string;
    zip_code: string;
    phone: string;
  };
  const [studio, setStudio] = useState<Studio | null>(null);

  // Distancia desde el alumno. Si no comparte su ubicacion, no se muestra.
  const [coords, setCoords] = useState<Coords | null>(null);
  useEffect(() => {
    getUserLocation()
      .then(setCoords)
      .catch(() => setCoords(null));
  }, []);

  {
    /*Calendario*/
  }
  // El calendario empieza HOY y avanza de 7 en 7 dias: no se puede ir a dias
  // pasados. Todo se cuenta en dias desde hoy.
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedOffset, setSelectedOffset] = useState(0);

  const days = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
  const months = [
    "ENE", "FEB", "MAR", "ABR", "MAY", "JUN",
    "JUL", "AGO", "SEP", "OCT", "NOV", "DIC",
  ];

  const dateAt = (offset: number) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return date;
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const offset = weekOffset * 7 + i;
    const date = dateAt(offset);
    return {
      offset,
      name: days[date.getDay()],
      number: date.getDate(),
      month: months[date.getMonth()],
    };
  });

  // Dia de la semana (0 = domingo) que se le pide al backend.
  const selectedDay = dateAt(selectedOffset).getDay();

  // Al cambiar de semana se selecciona su primer dia.
  const goToWeek = (week: number) => {
    setWeekOffset(week);
    setSelectedOffset(week * 7);
  };

  {
    /*Datos generales del estudio*/
  }
  useEffect(() => {
    api(`/studios/${id}`)
      .then((res) => res.json())
      .then((data) => setStudio(data));
  }, [id]);

  {
    /*Buscar clases por día*/
  }
  type Class = {
    id: number;
    name: string;
    instructor: string;
    price: number;
    time: string;
    schedule_id: number;
    available_spots: number;
  };

  const [classes, setClasses] = useState<Class[]>([]);
  // useCallback para que la funcion solo cambie de identidad cuando cambian el
  // estudio o el dia. Sin el, el efecto de abajo se relanzaria en cada render.
  const fetchClases = useCallback(() => {
    api(`/studios/${id}/clases?day=${selectedDay}`)
      .then((res) => res.json())
      .then((data) => setClasses(data));
  }, [id, selectedDay]);

  useEffect(() => {
    fetchClases();
  }, [fetchClases]);

  //Agregar a favoritos
  const [isFavorite, setIsFavorite] = useState(false);
  const handleAddToFavorite = () => {
    api(`/studios/favorites/${id}`, { method: "POST" });
  };

  const handleRemoveFromFavorite = () => {
    api(`/studios/favorites/${id}`, { method: "DELETE" });
  };

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    api(`/studios/favorites/${user.id}`)
      .then((res) => res.json())
      .then((data) => {
        const isFav = data.some(
          (fav: { studio_id: number }) => fav.studio_id === Number(id),
        );
        setIsFavorite(isFav);
      });
  }, [id]);

  // Fecha local YYYY-MM-DD. Con toISOString (UTC), despues de las 6 de la
  // tarde en Mexico la reserva quedaba con la fecha del dia siguiente.
  const getSelectedDate = () => {
    const date = dateAt(selectedOffset);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };

  const [userBookings, setUserBookings] = useState<number[]>([]);

  useEffect(() => {
    api("/bookings")
      .then((res) => res.json())
      .then((data) => {
        setUserBookings(data.map((b: { schedule_id: number }) => b.schedule_id));
      });
  }, []);

  if (!studio) return null;
  console.log(userBookings);

  return (
    <div className="relative h-72 w-full">
      <img
        src={studio.cover_url}
        alt={studio.name}
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
      <button className="absolute top-4 left-4 bg-white rounded-full p-2">
        <ArrowLeft
          className="cursor-pointer hover:text-[#33506f]"
          onClick={() => navigate(-1)}
          size={18}
        />
      </button>
      <button className="absolute top-4 right-4 bg-white rounded-full p-2">
        <Heart
          size={20}
          onClick={() => {
            if (isFavorite) {
              handleRemoveFromFavorite();
            } else {
              handleAddToFavorite();
            }
            setIsFavorite(!isFavorite);
          }}
          className={`cursor-pointer transition-colors hover:text-[#33506f] ${isFavorite ? "fill-[#1b2c44] text-[#1b2c44]" : "text-slate-400"}`}
        />
      </button>
      <div className="absolute bottom-4 left-6 text-white">
        <h1
          className="text-5xl font-semibold"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          {studio.name}
        </h1>
        <div className="flex items-center gap-3 mt-1 text-sm">
          {/* <div className="flex items-center gap-1">
            <Star size={14} className="fill-white" />
            <span>{studio.rating}</span>
          </div> */}
          {coords &&
            distanceKm(coords, studio.latitude, studio.longitude) != null && (
              <div className="flex items-center gap-1">
                <MapPin size={14} />
                <span>
                  A{" "}
                  {formatDistance(
                    distanceKm(coords, studio.latitude, studio.longitude)!,
                  )}{" "}
                  de ti
                </span>
              </div>
            )}
        </div>
      </div>

      {/*Tabs*/}
      <div className="flex flex-wrap items-center gap-2 px-6 py-4">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setStep(tab as Step)}
            className={`px-5 py-2 rounded-full text-sm transition-colors cursor-pointer ${
              step === tab
                ? "bg-[#1b2c44] text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:border-slate-400 cursor-pointer"
            }`}
          >
            {tab}
          </button>
        ))}
        <ShareStudioButton
          studioId={studio.id}
          studioName={studio.name}
          mode="share"
          label="Compartir estudio"
        />
      </div>

      {/*Clases*/}
      {step === "Clases" && (
        <div>
          <div className="flex items-center justify-center gap-2 px-6 py-4">
            {weekOffset > 0 && (
              <button
                onClick={() => goToWeek(weekOffset - 1)}
                className="p-2 rounded-full hover:bg-slate-100 transition-colors"
              >
                <ChevronLeft
                  size={18}
                  className="text-slate-400 hover:cursor-pointer"
                />
              </button>
            )}

            <div className="flex gap-2">
              {weekDays.map((day) => (
                <button
                  key={day.offset}
                  onClick={() => setSelectedOffset(day.offset)}
                  className={`flex flex-col items-center px-3 py-2 rounded-xl min-w-[52px] transition-colors border border-slate-200 hover:border-slate-400 cursor-pointer ${
                    selectedOffset === day.offset
                      ? "bg-[#1b2c44] text-white"
                      : "bg-white text-slate-600"
                  }`}
                >
                  <span className="text-xs font-medium">{day.name}</span>
                  <span className="text-lg font-semibold leading-tight">
                    {day.number}
                  </span>
                  <span className="text-[10px] font-medium opacity-70">
                    {day.month}
                  </span>
                </button>
              ))}
            </div>

            <button
              onClick={() => goToWeek(weekOffset + 1)}
              className="p-2 rounded-full hover:bg-slate-100 transition-colors"
            >
              <ChevronRight
                size={18}
                className="text-slate-400 hover:cursor-pointer"
              />
            </button>
          </div>
          <div className="flex flex-col gap-4 px-6 max-w-3xl mx-auto">
            {classes.map((classItem) => (
              <ClassCard
                key={classItem.id}
                hour={classItem.time}
                name={classItem.name}
                instructor={classItem.instructor}
                availablePlaces={classItem.available_spots}
                price={classItem.price}
                schedule_id={classItem.schedule_id}
                onReservaExitosa={() => fetchClases()}
                classDate={getSelectedDate() ?? ""}
                alreadyBooked={userBookings.includes(classItem.schedule_id)}
              />
            ))}
          </div>
        </div>
      )}

      {/*Paquetes a la venta de este estudio*/}
      {step === "Paquetes" && id && <StudioPackages studioId={id} />}

      {/*Detalles*/}
      {step === "Detalles" && (
        <div className="max-w-3xl bg-white rounded-2xl p-6 mx-auto px-6 py-4 flex flex-col gap-2">
          {/* Descripción */}
          <div className="bg-white rounded-2xl p-6">
            <h2 className="text-slate-600 text-2xl font-semibold mb-2">
              Sobre <span className="text-[#1b2c44]">{studio.name}</span>
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed">
              {studio.description}
            </p>
          </div>

          {/* Dirección */}
          <div className="bg-white rounded-2xl p-6 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <MapPin
                size={18}
                className="text-[#1b2c44] mt-0.5 flex-shrink-0"
              />
              <div>
                <p className="font-medium text-lg text-slate-800 mb-1">
                  Dirección
                </p>
                <p className=" text-slate-500 text-md">
                  {studio.street} #{studio.ext_number}
                  {studio.int_number ? `, ${studio.int_number}` : ""},{" "}
                  {studio.neighborhood}
                </p>
                <p className="text-slate-500 text-md">
                  {studio.city}, {studio.state}, {studio.country}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Phone
                size={18}
                className="text-[#1b2c44] mt-0.5 flex-shrink-0"
              />
              <div>
                <p className="text-lg font-medium text-slate-800 mb-1">
                  Teléfono
                </p>
                <p className="text-slate-500 text-md">{studio.phone}</p>
              </div>
            </div>
          </div>

          {/* Mapa */}
          <MapContainer
            center={[studio.latitude, studio.longitude]}
            zoom={15}
            className="w-full h-64 rounded-2xl z-0"
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Marker position={[studio.latitude, studio.longitude]}>
              <Popup>{studio.name}</Popup>
            </Marker>
          </MapContainer>
        </div>
      )}
    </div>
  );
}

export default EstudioDetalle;
