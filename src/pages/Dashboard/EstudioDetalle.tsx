import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import {
  Star,
  MapPin,
  ArrowLeft,
  Heart,
  Phone,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import ClassCard from "../../components/ClassCard";

function EstudioDetalle() {
  const navigate = useNavigate();
  const { id } = useParams();
  const tabs = ["Clases", "Detalles"];

  type Step = "Clases" | "Detalles";
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

  {
    /*Calendario*/
  }
  const today = new Date();
  const [selectedDay, setSelectedDay] = useState(today.getDay());
  const [weekOffset, setWeekOffset] = useState(0);

  const days = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today);
    date.setDate(today.getDate() - today.getDay() + i + weekOffset * 7);
    return {
      name: days[i],
      number: date.getDate(),
      dayIndex: i,
    };
  });

  {
    /*Datos generales del estudio*/
  }
  useEffect(() => {
    fetch(`http://localhost:3001/studios/${id}`)
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
  const fetchClases = () => {
    fetch(`http://localhost:3001/studios/${id}/clases?day=${selectedDay}`)
      .then((res) => res.json())
      .then((data) => setClasses(data));
  };

  useEffect(() => {
    fetchClases();
  }, [selectedDay]);

  //Agregar a favoritos
  const [isFavorite, setIsFavorite] = useState(false);
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const handleAddToFavorite = () => {
    fetch(`http://localhost:3001/studios/favorites/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id }),
    });
  };

  const handleRemoveFromFavorite = () => {
    fetch(`http://localhost:3001/studios/favorites/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id }),
    });
  };

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    fetch(`http://localhost:3001/studios/favorites/${user.id}`)
      .then((res) => res.json())
      .then((data) => {
        const isFav = data.some(
          (fav: { studio_id: number }) => fav.studio_id === Number(id),
        );
        setIsFavorite(isFav);
      });
  }, [id]);

  if (!studio) return null;

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
          className="cursor-pointer hover:text-[#2e4a2e]"
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
          className={`cursor-pointer transition-colors hover:text-[#2e4a2e] ${isFavorite ? "fill-[#3a5a3a] text-[#3a5a3a]" : "text-stone-400"}`}
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
          <div className="flex items-center gap-1">
            <MapPin size={14} />
            <span>0.8 km</span>
          </div>
        </div>
      </div>

      {/*Tabs*/}
      <div className="flex gap-2 px-6 py-4">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setStep(tab as Step)}
            className={`px-5 py-2 rounded-full text-sm transition-colors cursor-pointer ${
              step === tab
                ? "bg-[#3a5a3a] text-white"
                : "bg-white text-stone-600 border border-stone-200 hover:border-stone-400 cursor-pointer"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/*Clases*/}
      {step === "Clases" && (
        <div>
          <div className="flex items-center justify-center gap-2 px-6 py-4">
            {weekOffset > 0 && (
              <button
                onClick={() => setWeekOffset(weekOffset - 1)}
                className="p-2 rounded-full hover:bg-stone-100 transition-colors"
              >
                <ChevronLeft
                  size={18}
                  className="text-stone-400 hover:cursor-pointer"
                />
              </button>
            )}

            <div className="flex gap-2">
              {weekDays.map((day) => (
                <button
                  key={day.dayIndex}
                  onClick={() => setSelectedDay(day.dayIndex)}
                  className={`flex flex-col items-center px-3 py-2 rounded-xl min-w-[52px] transition-colors border border-stone-200 hover:border-stone-400 cursor-pointer ${
                    selectedDay === day.dayIndex
                      ? "bg-[#3a5a3a] text-white"
                      : "bg-white text-stone-600"
                  }`}
                >
                  <span className="text-xs font-medium">{day.name}</span>
                  <span className="text-lg font-semibold">{day.number}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setWeekOffset(weekOffset + 1)}
              className="p-2 rounded-full hover:bg-stone-100 transition-colors"
            >
              <ChevronRight
                size={18}
                className="text-stone-400 hover:cursor-pointer"
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
              />
            ))}
          </div>
        </div>
      )}

      {/*Detalles*/}
      {step === "Detalles" && (
        <div className="max-w-3xl bg-white rounded-2xl p-6 mx-auto px-6 py-4 flex flex-col gap-2">
          {/* Descripción */}
          <div className="bg-white rounded-2xl p-6">
            <h2 className="text-stone-600 text-2xl font-semibold mb-2">
              Sobre <span className="text-[#3a5a3a] italic">{studio.name}</span>
            </h2>
            <p className="text-lg text-stone-600 leading-relaxed">
              {studio.description}
            </p>
          </div>

          {/* Dirección */}
          <div className="bg-white rounded-2xl p-6 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <MapPin
                size={18}
                className="text-[#3a5a3a] mt-0.5 flex-shrink-0"
              />
              <div>
                <p className="font-medium text-lg text-stone-800 mb-1">
                  Dirección
                </p>
                <p className=" text-stone-500 text-md">
                  {studio.street} #{studio.ext_number}
                  {studio.int_number ? `, ${studio.int_number}` : ""},{" "}
                  {studio.neighborhood}
                </p>
                <p className="text-stone-500 text-md">
                  {studio.city}, {studio.state}, {studio.country}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Phone
                size={18}
                className="text-[#3a5a3a] mt-0.5 flex-shrink-0"
              />
              <div>
                <p className="text-lg font-medium text-stone-800 mb-1">
                  Teléfono
                </p>
                <p className="text-stone-500 text-md">{studio.phone}</p>
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
