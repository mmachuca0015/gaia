import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Lock,
  CreditCard,
  Bell,
  CircleQuestionMark,
  ChevronRight,
  LogOut,
} from "lucide-react";

function Perfil() {
  type User = {
    name: string;
    last_name: string;
    email: string;
  };

  const navigate = useNavigate();

  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    fetch("http://localhost:3001/users")
      .then((res) => res.json())
      .then((data) => setUser(data[0]));
  }, []);

  const menuItems = [
    { icon: Lock, label: "Privacidad", path: "perfil/privacidad" },
    {
      icon: CreditCard,
      label: "Agregar tarjeta",
      path: "/agregar-tarjeta",
    },
    { icon: Bell, label: "Notificaciones", path: "perfil/notificaciones" },
    { icon: CircleQuestionMark, label: "Ayuda", path: "perfil/ayuda" },
  ];

  const initials = user ? `${user.name[0]}${user.last_name[0]}` : "";
  if (!user) return null;
  return (
    <div>
      <div className="p-4 md:p-8">
        <h1
          className="text-4xl md:text-6xl font-semibold text-stone-800"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Mi{" "}
          <span
            className="italic text-[#3a5a3a]"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            Perfil
          </span>
        </h1>
      </div>
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl p-6 flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-full bg-stone-200 border border-stone-200 flex items-center justify-center text-stone-600 font-medium text-lg">
            {initials}
          </div>
          <div>
            <p className="font-semibold text-stone-800 text-lg">
              {user.name} {user.last_name}
            </p>
            <p className="text-stone-400 text-sm">{user.email}</p>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-2xl overflow-hidden max-w-2xl mx-auto">
        {menuItems.map((item, index) => (
          <div
            key={item.label}
            onClick={() => navigate(item.path)}
            className={`group flex items-center gap-3 px-5 py-4 hover:bg-[#3a5a3a] cursor-pointer transition-colors ${
              index !== menuItems.length - 1 ? "border-b border-stone-200" : ""
            }`}
          >
            <item.icon
              size={18}
              className="text-stone-400 group-hover:text-white"
            />
            <span className="flex-1 text-sm text-stone-700 group-hover:text-white">
              {item.label}
            </span>
            <ChevronRight
              size={16}
              className="text-stone-300 group-hover:text-white"
            />
          </div>
        ))}
        <div className="lg:hidden flex items-center gap-3 px-5 py-4 hover:bg-red-50 cursor-pointer transition-colors border-t border-stone-200">
          <LogOut size={18} className="text-red-400" />
          <span className="flex-1 text-sm text-red-400">Cerrar sesión</span>
          <ChevronRight size={16} className="text-red-300" />
        </div>
      </div>
    </div>
  );
}
export default Perfil;
