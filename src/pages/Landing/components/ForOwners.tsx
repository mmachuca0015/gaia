import { Link } from "react-router-dom";
import { LineChart, CalendarDays, Users, Store, Banknote } from "lucide-react";
import OwnerAppPreview from "./previews/OwnerAppPreview";

const capabilities = [
  {
    icon: LineChart,
    title: "Ingresos a la vista",
    description:
      "Cuánto entró hoy, esta semana, este mes o en seis meses. Con gráfica y actividad reciente en tiempo real.",
  },
  {
    icon: CalendarDays,
    title: "Clases y horarios",
    description:
      "Horario permanente o clases de una sola vez, con cupo, precio e instructor asignado.",
  },
  {
    icon: Users,
    title: "Instructores",
    description:
      "Da de alta a tu equipo, asígnalo a cada clase y deja que tus clientes vean con quién van a entrenar.",
  },
  {
    icon: Store,
    title: "Tu estudio, tu vitrina",
    description:
      "Fotos, dirección, descripción y horarios. Tú controlas cómo se ve tu estudio en el marketplace.",
  },
  {
    icon: Banknote,
    title: "Cobros con Stripe Connect",
    description:
      "El dinero de cada reserva llega directo a tu cuenta, sin intermediarios ni esperas.",
  },
];

function ForOwners() {
  return (
    <section id="estudios" className="bg-paper py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="max-w-2xl mb-14">
          <p className="text-[11px] tracking-[0.25em] text-slate-400 mb-4">
            PARA DUEÑOS DE ESTUDIO
          </p>
          <h2
            className="text-4xl md:text-5xl font-semibold text-ink leading-tight mb-5"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            Gestiona tu estudio completo
            <br />
            <span className="italic">desde un solo panel</span>
          </h2>
          <p className="text-slate-500 leading-relaxed">
            wellco no es solo una vitrina donde te encuentran: es el sistema con
            el que operas. Ingresos, clases, instructores, reservaciones y pagos
            en una sola plataforma — y clientes nuevos que llegan solos desde el
            marketplace.
          </p>
        </div>

        <div className="mb-14">
          <OwnerAppPreview />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-12">
          {capabilities.map((c) => (
            <div
              key={c.title}
              className="border border-line rounded-2xl p-6 bg-surface"
            >
              <c.icon size={20} className="text-ink mb-4" />
              <p className="font-medium text-ink mb-2">{c.title}</p>
              <p className="text-sm text-slate-500 leading-relaxed">
                {c.description}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href="#demo"
            className="bg-ink text-white px-8 py-4 rounded-full text-sm font-medium hover:bg-ink-soft transition-colors text-center"
          >
            Agenda un demo gratis
          </a>
          <Link
            to="/login"
            className="border border-line text-ink px-8 py-4 rounded-full text-sm font-medium hover:border-ink transition-colors text-center"
          >
            Registrar mi estudio
          </Link>
        </div>
      </div>
    </section>
  );
}

export default ForOwners;
