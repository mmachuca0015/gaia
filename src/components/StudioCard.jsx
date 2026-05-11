import { Star } from "lucide-react";
function Studiocard({
  cover_url,
  is_open,
  name,
  rating,
  price_from,
  neighborhood,
  distance,
}) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
      <div className="relative">
        <img src={cover_url} alt={name} className="w-full h-48 object-cover" />
        <span
          className={`absolute top-3 left-3 text-xs px-3 py-1 rounded-full font-medium ${
            is_open ? "bg-white text-[#3a5a3a]" : "bg-white text-stone-400"
          }`}
        >
          {is_open ? "Abierto" : "Cerrado"}
        </span>
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="font-medium text-stone-800">{name}</p>
          <div className="flex items-center gap-1 text-sm text-stone-500">
            <Star size={14} className="text-[#3a5a3a] fill-[#3a5a3a]">
              ★
            </Star>
            <span>{rating}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-stone-400 mb-4">
          <span>Desde ${price_from} / clase</span>
          <span>·</span>
          <span>{neighborhood}</span>
        </div>

        <button className="w-full bg-[#3a5a3a] text-white text-sm py-2.5 rounded-xl hover:bg-[#2e4a2e] transition-colors">
          Ver estudio
        </button>
      </div>
    </div>
  );
}

export default Studiocard;
