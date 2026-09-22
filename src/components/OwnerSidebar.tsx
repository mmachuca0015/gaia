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
import { fetchOwnerSubscription } from "../lib/subscription";
function OwnerSidebar() {
  const navigate = useNavigate();

  // Los avisos son una caracteristica del plan (Pro hoy). El backend lo
  // resuelve en /subscriptions/me con la misma regla con la que rechaza las
  // rutas, para que el menu no ofrezca una pestaña que va a dar 403.
  //
  // Arranca en false: mas vale que la pestaña aparezca un instante despues a
  // que parpadee y desaparezca en la cara de quien no la tiene.
  const [notices, setNotices] = useState(false);

  useEffect(() => {
    fetchOwnerSubscription()
      .then((sub) => setNotices(sub.notices === true))
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
