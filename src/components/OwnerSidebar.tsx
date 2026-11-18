import {
  LayoutDashboard,
  CalendarDays,
  Store,
  LogOut,
  Users,
  Check,
  Package,
  Megaphone,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { logout } from "../lib/api";
import {
  fetchOwnerSubscription,
  type OwnerSubscription,
} from "../lib/subscription";

// Lo que dice la etiqueta bajo el logo. Solo se nombra un plan cuando de veras
// lo tiene contratado: uno sin pagar o cancelado diria un plan que no opera.
function planLabel(sub: OwnerSubscription) {
  switch (sub.status) {
    case "activa":
    case "vencida":
      return sub.plan_name ? `Plan ${sub.plan_name}` : null;
    case "pendiente":
      return sub.plan_name ? `Plan ${sub.plan_name} · sin pagar` : null;
    case "demo":
      return "Demo";
    case "heredada":
      return null;
    default:
      return "Sin plan";
  }
}
function OwnerSidebar() {
  const navigate = useNavigate();

  // Los avisos son una caracteristica del plan (Pro hoy). El backend lo
  // resuelve en /subscriptions/me con la misma regla con la que rechaza las
  // rutas, para que el menu no ofrezca una pestaña que va a dar 403.
  //
  // Arranca en false: mas vale que la pestaña aparezca un instante despues a
  // que parpadee y desaparezca en la cara de quien no la tiene.
  const [notices, setNotices] = useState(false);
  const [plan, setPlan] = useState<string | null>(null);

  useEffect(() => {
    fetchOwnerSubscription()
      .then((sub) => {
        setNotices(sub.notices === true);
        setPlan(planLabel(sub));
      })
      .catch(() => setNotices(false));
  }, []);

  const navItems = [
    {
      icon: LayoutDashboard,
      label: "Panel de Control",
      path: "/panel-de-control",
    },
    { icon: CalendarDays, label: "Clases", path: "/owner/clases" },
    { icon: Package, label: "Paquetes", path: "/owner/paquetes" },
    { icon: Users, label: "Instructores", path: "/owner/instructores" },
    { icon: Check, label: "Reservas", path: "/owner/reservas" },
    ...(notices
      ? [{ icon: Megaphone, label: "Avisos", path: "/owner/avisos" }]
      : []),
    { icon: Store, label: "Estudio", path: "/owner/estudio" },
  ];

  return (
    <aside className="w-64 h-screen bg-[#ffffff] flex flex-col px-4 py-8">
      {/* Logo */}
      <div className="mb-10 px-3">
        <h1
          className="text-3xl font-semibold tracking-widest text-[#1b2c44]"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Wellco
        </h1>
        {plan && (
          <span className="inline-block mt-2 px-3 py-1 rounded-full bg-[#1b2c44] text-white text-xs font-medium">
            {plan}
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1">
        {navItems.map(({ icon: Icon, label, path }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-full text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[#1b2c44] text-white"
                  : "text-slate-500 hover:bg-[#e8eef7] hover:text-slate-800"
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto px-3">
        <button
          onClick={async () => {
            // Borrar el localStorage no cerraba nada: la sesion vive en el
            // servidor y hay que pedirle que la elimine.
            await logout();
            navigate("/login");
          }}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-full text-sm font-medium transition-colors border 
                      border-slate-300 text-slate-400 hover:border-[#1b2c44] hover:text-[#1b2c44] cursor-pointer"
        >
          <LogOut size={18} />
          Cerrar Sesión
        </button>
      </div>
    </aside>
  );
}

export default OwnerSidebar;
