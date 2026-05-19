import { Heart, MapPin, Star, CalendarCheck } from "lucide-react";

const features = [
  {
    icon: Heart,
    title: "Guarda tus favoritos",
    description: "Agrega estudios a tu lista y tenlos siempre a la mano.",
  },
  {
    icon: MapPin,
    title: "Filtra por ubicación",
    description: "Encuentra estudios cerca de ti en segundos.",
  },
  {
    icon: Star,
    title: "Reseñas reales",
    description: "Lee opiniones de la comunidad antes de reservar.",
  },
  {
    icon: CalendarCheck,
    title: "Reserva con un clic",
    description: "Sin llamadas, sin complicaciones. Solo tú y tu clase.",
  },
];

function Features() {
  return (
    <section className="bg-[#f6eee2] py-24 px-6">
      <div className="max-w-4xl mx-auto text-center mb-16">
        <p className="text-xs tracking-[0.3em] text-stone-400 mb-4">
          FUNCIONES
        </p>
        <h2
          className="text-4xl md:text-5xl font-semibold text-stone-800 leading-tight"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Todo lo que necesitas,{" "}
          <span className="italic text-[#3a5a3a]">en un solo lugar</span>
        </h2>
      </div>

      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="bg-white rounded-2xl p-8 shadow-sm"
          >
            <feature.icon size={22} className="text-[#3a5a3a] mb-4" />
            <p className="font-semibold text-stone-800 mb-2">{feature.title}</p>
            <p className="text-stone-400 text-sm">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default Features;
