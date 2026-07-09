import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Lock,
  CreditCard,
  Bell,
  SquarePen,
  CircleQuestionMark,
  ChevronRight,
  LogOut,
} from "lucide-react";

function OwnerEstudio() {
  const navigate = useNavigate();
  const menuItems = [
    { icon: SquarePen, label: "General", path: "/owner/estudio/general" },
    {
      icon: CreditCard,
      label: "Pagos",
      path: "/owner/estudio/pagos",
    },
    { icon: Lock, label: "Seguridad", path: "/owner/estudio/seguridad" },
    //   {
    //     icon: CircleQuestionMark,
    //     label: "Preguntas frecuentes",
    //     path: "/owner/estudio/preguntas-frecuentes",
    //   },
  ];

  //Obtener datos del estudio
  type Studio = {
    id: number;
    name: string;
    email: string;
    description: string;
  };

  const owner = JSON.parse(localStorage.getItem("user") || "{}");
  const [studio, setStudio] = useState<Studio | null>(null);
  useEffect(() => {
    fetch(`http://localhost:3001/studios/owner/${owner.id}`)
      .then((res) => res.json())
      .then((data) => setStudio(data));
  }, []);

  if (!studio) return null;
  return (
    <div>
      <div className="p-4 md:p-8">
        <div className="flex items-center justify-between mb-8">
          <h1
            className="text-4xl md:text-6xl font-semibold text-stone-800"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            Mi{" "}
            <span
              className="italic text-[#3a5a3a]"
              style={{ fontFamily: "Cormorant Garamond, serif" }}
            >
              Estudio
            </span>
          </h1>
        </div>
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl p-6 flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-full bg-stone-200 border border-stone-200 flex items-center justify-center text-stone-600 font-medium text-2xl">
              {studio?.name.charAt(0)}
            </div>
            <div>
              <p className="font-semibold text-stone-800 text-lg">
                {studio?.name}
              </p>
              <p className="text-stone-400 text-sm">{studio?.email}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl overflow-hidden max-w-2xl mx-auto">
          {menuItems.map((item, index) => (
            <div
              key={item.label}
              onClick={() => navigate(item.path)}
              className={`group flex items-center gap-3 px-5 py-4 hover:bg-[#3a5a3a] cursor-pointer transition-colors ${
                index !== menuItems.length - 1
                  ? "border-b border-stone-200"
                  : ""
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
    </div>
  );
}

export default OwnerEstudio;
