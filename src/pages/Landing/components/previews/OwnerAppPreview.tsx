import { LayoutDashboard, CalendarDays, Users, Store, Check } from "lucide-react";
import BrowserFrame from "./BrowserFrame";

const navItems = [
  { icon: LayoutDashboard, label: "Panel", active: true },
  { icon: CalendarDays, label: "Clases", active: false },
  { icon: Users, label: "Instructores", active: false },
  { icon: Store, label: "Estudio", active: false },
  { icon: Check, label: "Reservas", active: false },
];

const todayClasses = [
  { time: "07:00", name: "Reformer Flow", teacher: "Ana R.", spots: "3/12" },
  { time: "09:30", name: "Mat Pilates", teacher: "Luis M.", spots: "Lleno" },
  { time: "18:00", name: "Barre", teacher: "Sofía T.", spots: "5/10" },
];

const activity = [
  { text: "Nueva reserva · Reformer Flow", time: "hace 4 min" },
  { text: "Pago recibido · $320", time: "hace 22 min" },
  { text: "Nueva reserva · Barre", time: "hace 1 h" },
];

/* Render del panel del dueño. Reproduce PanelControl.tsx a escala chica; la
   grafica es un path dibujado a mano para no cargar Chart.js en la landing. */
function OwnerAppPreview() {
  return (
    <BrowserFrame url="wellco.app/panel-de-control">
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
          <p
            className="text-2xl font-semibold text-ink mb-4 leading-tight"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            Hola, Estudio Norte
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_150px] gap-3">
            <div className="flex flex-col gap-3 min-w-0">
              {/* Métricas */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-paper rounded-xl border border-line p-3 text-center">
                  <p className="text-[10px] text-slate-500 mb-0.5">Ingresos hoy</p>
                  <p
                    className="text-2xl font-semibold text-ink"
                    style={{ fontFamily: "Cormorant Garamond, serif" }}
                  >
                    $4,820
                  </p>
                </div>
                <div className="bg-paper rounded-xl border border-line p-3 text-center">
                  <p className="text-[10px] text-slate-500 mb-0.5">Clases hoy</p>
                  <p
                    className="text-2xl font-semibold text-ink"
                    style={{ fontFamily: "Cormorant Garamond, serif" }}
                  >
                    7
                  </p>
                </div>
              </div>

              {/* Ingresos + gráfica */}
              <div className="bg-paper rounded-xl border border-line p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold text-ink">Ingresos</p>
                  <div className="hidden md:flex gap-1">
                    {["Hoy", "7 días", "1 mes"].map((f, i) => (
                      <span
                        key={f}
                        className={`px-2 py-0.5 rounded-full text-[9px] ${
                          i === 1
                            ? "bg-ink text-white"
                            : "border border-line text-slate-500"
                        }`}
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
                <p
                  className="text-xl font-semibold text-ink mb-1"
                  style={{ fontFamily: "Cormorant Garamond, serif" }}
                >
                  $31,540
                </p>
                <svg
                  viewBox="0 0 300 70"
                  className="w-full h-14"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="wellcoArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1b2c44" stopOpacity="0.14" />
                      <stop offset="100%" stopColor="#1b2c44" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0,55 C25,52 40,38 60,40 C85,42 95,22 120,26 C145,30 155,44 180,36 C205,28 215,12 240,16 C265,20 280,9 300,6 L300,70 L0,70 Z"
                    fill="url(#wellcoArea)"
                  />
                  <path
                    d="M0,55 C25,52 40,38 60,40 C85,42 95,22 120,26 C145,30 155,44 180,36 C205,28 215,12 240,16 C265,20 280,9 300,6"
                    fill="none"
                    stroke="#1b2c44"
                    strokeWidth="1.6"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              </div>

              {/* Clases de hoy */}
              <div className="bg-paper rounded-xl border border-line p-3">
                <p className="text-[11px] font-semibold text-ink mb-2">
                  Clases de hoy
                </p>
                <div className="flex flex-col">
                  {todayClasses.map((c) => (
                    <div
                      key={c.time}
                      className="flex items-center justify-between gap-2 py-2 border-b border-line last:border-0"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <p
                          className="text-sm font-semibold text-ink"
                          style={{ fontFamily: "Cormorant Garamond, serif" }}
                        >
                          {c.time}
                        </p>
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium text-ink truncate">
                            {c.name}
                          </p>
                          <p className="text-[10px] text-slate-500 truncate">
                            con {c.teacher}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded-full whitespace-nowrap ${
                          c.spots === "Lleno"
                            ? "bg-slate-100 text-slate-500"
                            : "bg-ink/5 text-ink"
                        }`}
                      >
                        {c.spots}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Actividad reciente */}
            <div className="hidden lg:block bg-paper rounded-xl border border-line p-3 h-fit">
              <p className="text-[11px] font-semibold text-ink pb-2 mb-2 border-b border-line">
                Actividad
              </p>
              <ul className="flex flex-col gap-2.5">
                {activity.map((a) => (
                  <li key={a.text}>
                    <p className="text-[10px] text-ink leading-snug">{a.text}</p>
                    <p className="text-[9px] text-slate-400">{a.time}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </BrowserFrame>
  );
}

export default OwnerAppPreview;
