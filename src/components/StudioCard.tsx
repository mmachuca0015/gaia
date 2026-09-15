import { useNavigate } from "react-router-dom";

type StudioCardProps = {
  id: number;
  cover_url: string;
  is_open: boolean;
  name: string;
  rating: number;
  price_from: number;
  neighborhood: string;
};

function Studiocard({
  id,
  cover_url,
  is_open,
  name,
  price_from,
  neighborhood,
}: StudioCardProps) {
  const navigate = useNavigate();

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
      <div className="relative">
        <img src={cover_url} alt={name} className="w-full h-48 object-cover" />
        <span
          className={`absolute top-3 left-3 text-xs px-3 py-1 rounded-full font-medium ${
            is_open ? "bg-white text-[#1b2c44]" : "bg-white text-slate-400"
          }`}
        >
          {is_open ? "Abierto" : "Cerrado"}
        </span>
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="font-medium text-slate-800">{name}</p>
          {/* <div className="flex items-center gap-1 text-sm text-slate-500">
            <Star size={14} className="text-[#1b2c44] fill-[#1b2c44]">
              ★
            </Star>
            <span>{rating}</span>
          </div> */}
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-400 mb-4">
          <span>Desde ${price_from} / clase</span>
          <span>·</span>
          <span>{neighborhood}</span>
        </div>

        <button
          onClick={() => navigate(`/studios/${id}`)}
          className="w-full bg-[#1b2c44] text-white text-sm py-2.5 rounded-xl hover:bg-[#33506f] transition-colors cursor-pointer"
        >
          Ver estudio
        </button>
      </div>
    </div>
  );
}

export default Studiocard;
