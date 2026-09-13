import { Link } from "react-router-dom";

const columns = [
  {
    title: "Plataforma",
    links: [
      { label: "Para ti", href: "#clientes" },
      { label: "Para estudios", href: "#estudios" },
      { label: "Comparativa", href: "#comparativa" },
      { label: "Precios", href: "#precios" },
    ],
  },
  {
    title: "Empezar",
    links: [
      { label: "Agenda un demo", href: "#demo" },
      { label: "Iniciar sesión", href: "/login", internal: true },
      { label: "Registrar mi estudio", href: "/login", internal: true },
    ],
  },
];

function Footer() {
  return (
    <footer className="bg-paper border-t border-line px-6 py-14">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row gap-10 md:gap-20 mb-12">
          <div className="md:max-w-xs">
            <p
              className="text-2xl font-semibold tracking-widest text-ink mb-3"
              style={{ fontFamily: "Cormorant Garamond, serif" }}
            >
              wellco
            </p>
            <p className="text-sm text-slate-500 leading-relaxed">
              El marketplace donde reservas tu clase de ejercicio favorita — y
              donde los estudios gestionan todo su negocio.
            </p>
          </div>

          <div className="flex gap-16">
            {columns.map((col) => (
              <div key={col.title}>
                <p className="text-xs tracking-[0.2em] text-slate-400 mb-4">
                  {col.title.toUpperCase()}
                </p>
                <ul className="flex flex-col gap-2.5">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      {l.internal ? (
                        <Link
                          to={l.href}
                          className="text-sm text-slate-500 hover:text-ink transition-colors"
                        >
                          {l.label}
                        </Link>
                      ) : (
                        <a
                          href={l.href}
                          className="text-sm text-slate-500 hover:text-ink transition-colors"
                        >
                          {l.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-line pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-400">
            © {new Date().getFullYear()} wellco. Todos los derechos reservados.
          </p>
          <p className="text-xs text-slate-400">
            Pagos procesados por Stripe.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
