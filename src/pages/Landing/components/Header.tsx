import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";

const links = [
  { label: "Para ti", href: "#clientes" },
  { label: "Para estudios", href: "#estudios" },
  { label: "Comparativa", href: "#comparativa" },
  { label: "Precios", href: "#precios" },
];

function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-paper/85 backdrop-blur border-b border-line">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <a
          href="#top"
          className="text-2xl font-semibold tracking-widest text-ink"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Wellco
        </a>

        <nav className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-slate-500 hover:text-ink transition-colors"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <Link
            to="/login"
            className="text-sm text-slate-600 hover:text-ink transition-colors"
          >
            Iniciar sesión
          </Link>
          <a
            href="#demo"
            className="bg-ink text-white text-sm px-5 py-2.5 rounded-full hover:bg-ink-soft transition-colors"
          >
            Agenda un demo
          </a>
        </div>

        <button
          onClick={() => setOpen(!open)}
          className="md:hidden text-ink cursor-pointer"
          aria-label="Menú"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-line bg-paper px-6 py-4 flex flex-col gap-4">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="text-sm text-slate-600"
            >
              {l.label}
            </a>
          ))}
          <Link to="/login" className="text-sm text-slate-600">
            Iniciar sesión
          </Link>
          <a
            href="#demo"
            onClick={() => setOpen(false)}
            className="bg-ink text-white text-sm px-5 py-2.5 rounded-full text-center"
          >
            Agenda un demo
          </a>
        </div>
      )}
    </header>
  );
}

export default Header;
