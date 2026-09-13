// src/components/AdminSidebar.tsx
import {
  LayoutDashboard,
  Users,
  Store,
  CreditCard,
  LogOut,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";

import { logout } from "../lib/api";
function AdminSidebar() {
  const navigate = useNavigate();

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/admin", end: true },
    { icon: Users, label: "Usuarios", path: "/admin/usuarios", end: false },
    { icon: Store, label: "Estudios", path: "/admin/estudios", end: false },
    {
      icon: CreditCard,
      label: "Suscripciones",
      path: "/admin/suscripciones",
      end: false,
    },
  ];

  return (
    <aside className="w-64 h-screen bg-[#f9f4ec] flex flex-col px-4 py-8">
      <div className="mb-10 px-3">
        <h1
          className="text-3xl font-semibold tracking-widest text-[#3a5a3a]"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          PILA
        </h1>
        <p className="text-xs tracking-[0.3em] text-stone-500 mt-0.5">ADMIN</p>
      </div>

      <nav className="flex flex-col gap-1">
        {navItems.map(({ icon: Icon, label, path, end }) => (
          <NavLink
            key={path}
            to={path}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-full text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[#3a5a3a] text-white"
                  : "text-stone-500 hover:bg-[#e8e2d8] hover:text-stone-800"
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
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-full text-sm font-medium transition-colors border border-stone-300 text-stone-400 hover:border-[#3a5a3a] hover:text-[#3a5a3a] cursor-pointer"
        >
          <LogOut size={18} />
          Cerrar Sesión
        </button>
      </div>
    </aside>
  );
}

export default AdminSidebar;
