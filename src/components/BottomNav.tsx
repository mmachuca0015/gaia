import { Compass, CalendarDays, User, Package, Bell } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

import { useUnreadNotices } from "../lib/notices";

function BottomNav() {
  // El mismo punto que el sidebar: en el telefono esta barra es el unico
  // camino a Notificaciones.
  const { pathname } = useLocation();
  const unread = useUnreadNotices(pathname);

  const navItems = [
    { icon: Compass, label: "Explorar", path: "/explorar" },
    { icon: CalendarDays, label: "Clases", path: "/clases" },
    { icon: Package, label: "Paquetes", path: "/mis-paquetes" },
    // "Avisos" y no "Notificaciones": la palabra completa no cabe en una
    // barra de cinco a lo ancho de un telefono.
    { icon: Bell, label: "Avisos", path: "/notificaciones" },
    { icon: User, label: "Perfil", path: "/perfil" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#ffffff] border-t border-slate-200 flex justify-around items-center py-3 lg:hidden">
      {navItems.map(({ icon: Icon, label, path }) => (
        <NavLink
          key={path}
          to={path}
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 text-xs transition-colors ${
              isActive ? "text-[#1b2c44]" : "text-slate-400"
            }`
          }
        >
          <span className="relative">
            <Icon size={18} />
            {path === "/notificaciones" && unread > 0 && (
              <span className="absolute -top-1 -right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white" />
            )}
          </span>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export default BottomNav;
