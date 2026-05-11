import { LayoutDashboard, CalendarDays, User } from "lucide-react";
import { NavLink } from "react-router-dom";

function BottomNav() {
  const navItems = [
    { icon: LayoutDashboard, label: "Explorar", path: "/explorar" },
    { icon: CalendarDays, label: "Clases", path: "/clases" },
    { icon: User, label: "Perfil", path: "/perfil" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#f9f4ec] border-t border-stone-200 flex justify-around items-center py-3 lg:hidden">
      {navItems.map(({ icon: Icon, label, path }) => (
        <NavLink
          key={path}
          to={path}
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 text-xs transition-colors ${
              isActive ? "text-[#3a5a3a]" : "text-stone-400"
            }`
          }
        >
          <Icon size={18} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export default BottomNav;
