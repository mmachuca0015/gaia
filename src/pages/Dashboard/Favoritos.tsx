import { useState, useEffect } from "react";
import StudioCard from "../../components/StudioCard";

function Favoritos() {
  type Studio = {
    studio_id: number;
    street: string;
    name: string;
    cover_url: string;
    is_open: boolean;
    rating: number;
    price_from: number;
    neighborhood: string;
  };

  const [studios, setStudios] = useState<Studio[]>([]);
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  useEffect(() => {
    fetch(`http://localhost:3001/studios/favorites/${user.id}`)
      .then((res) => res.json())
      .then((data) => setStudios(data));
  }, []);

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="mb-14">
        <h1
          className="text-4xl md:text-6xl font-semibold text-stone-800"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Tus estudios{" "}
          <span
            className="italic text-[#3a5a3a]"
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

export default Favoritos;
