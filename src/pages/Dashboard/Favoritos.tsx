import { useState, useEffect } from "react";
import StudioCard from "../../components/StudioCard";

import { api } from "../../lib/api";
function Favoritos() {
  type Studio = {
    studio_id: number;
    street: string;
    name: string;
    cover_url: string;
    /** Abierto ahora, segun su horario. */
    open_now: boolean;
    rating: number;
    /** Clase mas barata del estudio; null si aun no tiene clases. */
    min_price: number | null;
    neighborhood: string;
  };

  const [studios, setStudios] = useState<Studio[]>([]);
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  useEffect(() => {
    api(`/studios/favorites/${user.id}`)
      .then((res) => res.json())
      .then((data) => setStudios(data));
  }, [user.id]);

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="mb-14">
        <h1
          className="text-4xl md:text-6xl font-semibold text-slate-800"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Tus estudios{" "}
          <span
            className="text-[#1b2c44]"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            favoritos
          </span>
        </h1>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {studios.map((studio) => (
          <div key={studio.studio_id}>
            <StudioCard
              id={studio.studio_id}
              cover_url={studio.cover_url}
              is_open={studio.open_now}
              name={studio.name}
              rating={studio.rating}
              price_from={studio.min_price}
              neighborhood={studio.neighborhood}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default Favoritos;
