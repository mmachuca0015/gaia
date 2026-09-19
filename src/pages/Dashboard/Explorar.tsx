import { useState, useEffect } from "react";
import StudioCard from "../../components/StudioCard";
import { ChevronDown, Search } from "lucide-react";

import { api } from "../../lib/api";
import { distanceKm, getUserLocation, type Coords } from "../../lib/location";
function Explorar() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  type Studio = {
    id: number;
    name: string;
    street: string;
    cover_url: string;
    is_open: boolean;
    rating: number;
    /** Clase mas barata del estudio; null si aun no tiene clases. */
    min_price: number | null;
    neighborhood: string;
    latitude: string | null;
    longitude: string | null;
  };
  const [studios, setStudios] = useState<Studio[]>([]);
  useEffect(() => {
    api("/studios")
      .then((res) => res.json())
      .then((data) => setStudios(data));
  }, []);

  type Filter = "Más cerca" | "Menor precio" | "Mayor precio";
  const [activeFilter, setActiveFilter] = useState<Filter>("Más cerca");
  const [priceMenuOpen, setPriceMenuOpen] = useState(false);
  const priceActive = activeFilter !== "Más cerca";
  const [search, setSearch] = useState("");

  // Ubicacion del alumno, solo para "Más cerca". Se pide al elegir el filtro
  // (que es el de entrada); si no da permiso, el orden queda como estaba.
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [locationAttempt, setLocationAttempt] = useState(0);
  useEffect(() => {
    if (activeFilter !== "Más cerca" || coords) return;
    getUserLocation()
      .then((c) => {
        setCoords(c);
        setLocationDenied(false);
      })
      .catch(() => setLocationDenied(true));
  }, [activeFilter, coords, locationAttempt]);

  const distanceTo = (studio: Studio) =>
    coords ? distanceKm(coords, studio.latitude, studio.longitude) : null;

  const sortedStudios = [...studios]
    .filter((studio) => {
      const query = search.toLowerCase();
      return (
        studio.name.toLowerCase().includes(query) ||
        studio.neighborhood.toLowerCase().includes(query) ||
        studio.street.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      if (a.is_open !== b.is_open) return a.is_open ? -1 : 1;
      // Por precio: los que aun no tienen clases van al final en los dos
      // sentidos.
      if (priceActive) {
        if (a.min_price == null || b.min_price == null) {
          return a.min_price == null ? (b.min_price == null ? 0 : 1) : -1;
        }
        return activeFilter === "Menor precio"
          ? a.min_price - b.min_price
          : b.min_price - a.min_price;
      }
      // Más cerca: el mas cercano primero; los que no tienen ubicacion, al
      // final.
      const da = distanceTo(a) ?? Infinity;
      const db = distanceTo(b) ?? Infinity;
      return da - db;
    });

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-8">
        <div>
          <h1
            className="text-4xl md:text-6xl font-semibold text-slate-800"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            Hola,{" "}
            <span
              className="text-[#1b2c44]"
              style={{ fontFamily: "Cormorant Garamond, serif" }}
            >
              {user.name}
            </span>
          </h1>
          <p className="text-base text-slate-600 mt-1">
            Encuentra tu próximo espacio para moverte.
          </p>
        </div>

        <div className="mt-4 lg:mt-0">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Buscar estudios..."
              className="w-full md:w-[360px] pl-10 pr-4 py-3 rounded-full bg-white border border-slate-200 text-sm text-slate-600 placeholder:text-slate-400 outline-none focus:border-slate-400 transition-colors"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => {
            setActiveFilter("Más cerca");
            setPriceMenuOpen(false);
            // Volver a elegir "Más cerca" reintenta si antes no hubo permiso.
            setLocationAttempt((n) => n + 1);
          }}
          className={`px-5 py-2 rounded-full text-sm transition-colors cursor-pointer ${
            !priceActive
              ? "bg-[#1b2c44] text-white"
              : "bg-white text-slate-600 border border-slate-200 hover:border-slate-400"
          }`}
        >
          Más cerca
        </button>

        {/* Precio: un boton que abre "Menor precio" / "Mayor precio" */}
        <div className="relative">
          <button
            onClick={() => setPriceMenuOpen((open) => !open)}
            className={`flex items-center gap-1.5 px-5 py-2 rounded-full text-sm transition-colors cursor-pointer ${
              priceActive
                ? "bg-[#1b2c44] text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:border-slate-400"
            }`}
          >
            {priceActive ? activeFilter : "Precio"}
            <ChevronDown
              size={15}
              className={`transition-transform ${priceMenuOpen ? "rotate-180" : ""}`}
            />
          </button>
          {priceMenuOpen && (
            <>
              {/* Clic fuera del menu lo cierra */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setPriceMenuOpen(false)}
              />
              <div className="absolute left-0 mt-2 z-20 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden min-w-[160px]">
                {(["Menor precio", "Mayor precio"] as const).map((option) => (
                  <button
                    key={option}
                    onClick={() => {
                      setActiveFilter(option);
                      setPriceMenuOpen(false);
                    }}
                    className={`block w-full text-left px-4 py-2.5 text-sm transition-colors cursor-pointer ${
                      activeFilter === option
                        ? "bg-[#e8eef7] text-[#1b2c44] font-medium"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {activeFilter === "Más cerca" && locationDenied && (
        <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl px-4 py-3 mb-6 max-w-xl">
          Para ver primero los estudios más cercanos, permite que el navegador
          use tu ubicación y vuelve a elegir «Más cerca».
        </p>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {sortedStudios.map((studio) => (
          <div key={studio.id}>
            <StudioCard
              id={studio.id}
              cover_url={studio.cover_url}
              is_open={studio.is_open}
              name={studio.name}
              rating={studio.rating}
              price_from={studio.min_price}
              neighborhood={studio.neighborhood}
              distanceKm={distanceTo(studio)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default Explorar;
