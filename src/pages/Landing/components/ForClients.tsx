import {
  MousePointerClick,
  ShieldCheck,
  Heart,
  MapPin,
  CalendarCheck,
  Wallet,
} from "lucide-react";

const features = [
  {
    icon: MousePointerClick,
    title: "Fácil de usar",
    description:
      "Buscas, eliges horario y reservas. Sin llamadas, sin WhatsApp, sin esperar a que alguien conteste.",
  },
  {
    icon: ShieldCheck,
    title: "Seguro de verdad",
    description:
      "Tu sesión vive en el servidor y se puede revocar al instante. Tus pagos los procesa Stripe: wellco nunca guarda tu tarjeta.",
  },
  {
    icon: MapPin,
    title: "Estudios cerca de ti",
    description:
      "Filtra por zona, precio o calificación y ve la ubicación exacta en el mapa antes de reservar.",
  },
  {
    icon: CalendarCheck,
    title: "Tus clases, ordenadas",
    description:
      "Mis Clases te muestra lo que viene y lo que ya tomaste. Recibes confirmación por correo de cada reserva.",
  },
  {
    icon: Heart,
    title: "Favoritos",
    description:
      "Guarda los estudios que te gustan y vuelve a reservar en dos toques.",
  },
  {
    icon: Wallet,
    title: "Un solo lugar",
    description:
      "Varios estudios, un mismo perfil y un mismo método de pago. Cambia de estudio sin volver a registrarte.",
  },
];

function ForClients() {
  return (
    <section id="clientes" className="bg-surface py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="max-w-2xl mb-14">
          <p className="text-[11px] tracking-[0.25em] text-slate-400 mb-4">
            PARA TI
          </p>
          <h2
            className="text-4xl md:text-5xl font-semibold text-ink leading-tight mb-5"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            Encuentra tu estudio.
            <br />
            <span className="italic">Aparta tu lugar.</span> Ya.
          </h2>
          <p className="text-slate-500 leading-relaxed">
            Una app para reservar tu clase de ejercicio favorita en el estudio
            que más te late. Todos los estudios de tu ciudad en un mismo lugar,
            con horarios reales y lugares disponibles al momento.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-paper border border-line rounded-2xl p-6"
            >
              <f.icon size={20} className="text-ink mb-4" />
              <p className="font-medium text-ink mb-2">{f.title}</p>
              <p className="text-sm text-slate-500 leading-relaxed">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default ForClients;
