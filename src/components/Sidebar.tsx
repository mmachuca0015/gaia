import { Compass, CalendarDays, User, LogOut, Heart, Bell } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";

import { logout } from "../lib/api";
const navItems = [
  { icon: Compass, label: "Explorar", path: "/explorar" },
  { icon: CalendarDays, label: "Mis Clases", path: "/clases" },
  { icon: User, label: "Perfil", path: "/perfil" },
  { icon: Heart, label: "Favoritos", path: "/favoritos" },
  // { icon: Bell, label: "Notificaciones", path: "/notificaciones" },
];

function Sidebar() {
  const navigate = useNavigate();
  return (
    <aside className="w-64 h-screen bg-[#ffffff] flex flex-col px-4 py-8">
      {/* Logo */}
      <div className="mb-10 px-3">
        <h1
          className="text-3xl font-semibold tracking-widest text-[#1b2c44]"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          wellco
        </h1>
        <p className="text-xs tracking-[0.3em] text-slate-500 mt-0.5">
          WELLNESS
        </p>
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

export default Sidebar;
