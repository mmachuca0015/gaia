import { Link } from "react-router-dom";
import { ShieldCheck, Zap, CreditCard } from "lucide-react";
import UserAppPreview from "./previews/UserAppPreview";

const trust = [
  { icon: Zap, text: "Reserva en menos de 30 segundos" },
  { icon: ShieldCheck, text: "Sesiones seguras, sin contraseñas expuestas" },
  { icon: CreditCard, text: "Pagos protegidos con Stripe" },
];

function Hero() {
  return (
    <section id="top" className="bg-paper pt-20 pb-16 px-6">
      <div className="max-w-5xl mx-auto text-center">
        <span className="inline-block border border-line text-slate-500 text-[11px] tracking-[0.2em] px-4 py-1.5 rounded-full mb-8">
          MARKETPLACE DE ESTUDIOS
        </span>

        <h1
          className="text-5xl md:text-7xl font-semibold text-ink leading-[1.05] mb-6"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Reserva tu clase favorita
          <br />
          <span className="italic">en tu estudio favorito</span>
        </h1>

        <p className="text-base md:text-lg text-slate-500 max-w-2xl mx-auto mb-10 leading-relaxed">
          wellco es la plataforma que conecta estudios de ejercicio con quienes
          quieren moverse. Encuentra, reserva y paga en segundos — y si tienes un
          estudio, gestiónalo completo desde un solo panel.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
          {/* Los dos botones parten la audiencia: cada quien entra por su lado. */}
          <Link
            to="/login"
            className="bg-ink text-white px-8 py-4 rounded-full text-sm font-medium hover:bg-ink-soft transition-colors"
          >
            Soy atleta
          </Link>
          <a
            href="#estudios"
            className="border border-ink text-ink px-8 py-4 rounded-full text-sm font-medium hover:bg-ink hover:text-white transition-colors"
          >
            Soy dueño de estudio
          </a>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-400">
          {trust.map(({ icon: Icon, text }) => (
            <span key={text} className="flex items-center gap-1.5">
              <Icon size={13} />
              {text}
            </span>
          ))}
        </div>
      </div>

      {/* Render de la app */}
      <div className="max-w-5xl mx-auto mt-16">
        <UserAppPreview />
      </div>
    </section>
  );
}

export default Hero;
