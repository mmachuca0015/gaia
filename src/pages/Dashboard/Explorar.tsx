import { useState, useEffect } from "react";
import StudioCard from "../../components/StudioCard";
import { Search } from "lucide-react";

function Explorar() {
  type Studio = {
    id: number;
    name: string;
    street: string;
    cover_url: string;
    is_open: boolean;
    rating: number;
    price_from: number;
    neighborhood: string;
  };
  const [studios, setStudios] = useState<Studio[]>([]);
  useEffect(() => {
    fetch("http://localhost:3001/studios")
      .then((res) => res.json())
      .then((data) => setStudios(data));
  }, []);

  const filters = ["Más cerca", "Mejor rating", "Mayor precio", "Menor precio"];
  const [activeFilter, setActiveFilter] = useState("Más cerca");
  const [search, setSearch] = useState("");

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
      if (activeFilter === "Mejor rating") return b.rating - a.rating;
      if (activeFilter === "Menor precio") return a.price_from - b.price_from;
      if (activeFilter === "Mayor precio") return b.price_from - a.price_from;
      return 0;
    });

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-8">
        <div>
          <h1
            className="text-4xl md:text-6xl font-semibold text-stone-800"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            Hola,{" "}
            <span
              className="italic text-[#3a5a3a]"
              style={{ fontFamily: "Cormorant Garamond, serif" }}
            >
              Valeria
            </span>{" "}
            🌿
          </h1>
          <p className="text-base text-stone-600 mt-1">
            Encuentra tu próximo espacio para moverte.
          </p>
        </div>

        <div className="mt-4 lg:mt-0">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400"
            />
            <input
              type="text"
              placeholder="Buscar estudios..."
              className="w-full md:w-[360px] pl-10 pr-4 py-3 rounded-full bg-white border border-stone-200 text-sm text-stone-600 placeholder:text-stone-400 outline-none focus:border-stone-400 transition-colors"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-6">
        {filters.map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`px-5 py-2 rounded-full text-sm transition-colors ${
              activeFilter === filter
                ? "bg-[#3a5a3a] text-white"
                : "bg-white text-stone-600 border border-stone-200 hover:border-stone-400 cursor-pointer"
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

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
              price_from={studio.price_from}
              neighborhood={studio.neighborhood}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default Explorar;
