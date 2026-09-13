import { Compass, CalendarDays, User, Heart, Search, Star } from "lucide-react";
import BrowserFrame from "./BrowserFrame";

const navItems = [
  { icon: Compass, label: "Explorar", active: true },
  { icon: CalendarDays, label: "Mis Clases", active: false },
  { icon: Heart, label: "Favoritos", active: false },
  { icon: User, label: "Perfil", active: false },
];

const studios = [
  { name: "Estudio Norte", price: 180, zone: "Condesa", open: true, tone: "from-slate-300 to-slate-200" },
  { name: "Casa Reforma", price: 210, zone: "Roma Nte.", open: true, tone: "from-slate-400 to-slate-300" },
  { name: "Método Sur", price: 165, zone: "Del Valle", open: false, tone: "from-slate-300 to-slate-100" },
];

/* Render del dashboard del cliente. Reproduce Explorar.tsx a escala chica. */
function UserAppPreview() {
  return (
    <BrowserFrame url="wellco.app/explorar">
      <div className="flex bg-surface">
        {/* Sidebar */}
        <aside className="hidden sm:flex w-40 flex-col px-3 py-5 bg-paper border-r border-line">
          <p
            className="text-lg font-semibold tracking-widest text-ink px-2 mb-6"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            wellco
          </p>
          <nav className="flex flex-col gap-1">
            {navItems.map(({ icon: Icon, label, active }) => (
              <span
                key={label}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-full text-[11px] font-medium ${
                  active ? "bg-ink text-white" : "text-slate-500"
                }`}
              >
                <Icon size={13} />
                {label}
              </span>
            ))}
          </nav>
        </aside>

        {/* Contenido */}
        <div className="flex-1 p-5 min-w-0">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <p
                className="text-2xl font-semibold text-ink leading-tight"
                style={{ fontFamily: "Cormorant Garamond, serif" }}
              >
                Hola, Ana
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Encuentra tu próximo espacio para moverte.
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-full bg-paper border border-line">
              <Search size={12} className="text-slate-400" />
              <span className="text-[11px] text-slate-400">Buscar estudios...</span>
            </div>
          </div>

          <div className="flex gap-1.5 mb-4">
            {["Más cerca", "Mejor rating", "Menor precio"].map((f, i) => (
              <span
                key={f}
                className={`px-3 py-1 rounded-full text-[10px] whitespace-nowrap ${
                  i === 0
                    ? "bg-ink text-white"
                    : "bg-paper text-slate-500 border border-line"
                }`}
              >
                {f}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {studios.map((s) => (
              <div
                key={s.name}
                className="bg-paper rounded-xl overflow-hidden border border-line"
              >
                <div className={`relative h-16 bg-gradient-to-br ${s.tone}`}>
                  <span className="absolute top-2 left-2 text-[9px] px-2 py-0.5 rounded-full bg-paper text-ink font-medium">
                    {s.open ? "Abierto" : "Cerrado"}
                  </span>
                </div>
                <div className="p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[11px] font-medium text-ink truncate">{s.name}</p>
                    <span className="flex items-center gap-0.5 text-[9px] text-slate-500">
                      <Star size={9} className="fill-ink text-ink" />
                      4.9
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mb-2 truncate">
                    Desde ${s.price} · {s.zone}
                  </p>
                  <div className="w-full bg-ink text-white text-[10px] py-1.5 rounded-lg text-center">
                    Ver estudio
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BrowserFrame>
  );
}

export default UserAppPreview;
