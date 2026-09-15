import { ArrowLeft, CreditCard } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

import { api } from "../../lib/api";
function OwnerEstudioPagos() {
  const navigate = useNavigate();

  type Studio = {
    id: string;
    stripe_account_id: string;
  };

  const owner = JSON.parse(localStorage.getItem("user") || "{}");
  const [studio, setStudio] = useState<Studio | null>(null);
  useEffect(() => {
    api(`/studios/owner/${owner.id}`)
      .then((res) => res.json())
      .then((data) => setStudio(data));
  }, [owner.id]);

  const handleConnectAccount = async () => {
    // El estudio lo determina el backend a partir de la sesion del dueño.
    const res = await api("/payments/create-connect-account", {
      method: "POST",
    });
    const data = await res.json();
    if (res.ok) {
      // assign() en vez de asignar .href: hace lo mismo, pero no es escribir
      // sobre una variable de fuera del componente.
      window.location.assign(data.url);
    }
    setLoading(false);
  };

  const [loading, setLoading] = useState(false);

  return (
    <div className="p-4 md:p-8">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        <ArrowLeft
          size={22}
          onClick={() => navigate(-1)}
          className="text-[#1b2c44] cursor-pointer"
        />
        <h1
          className="text-4xl md:text-6xl font-semibold text-slate-800"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Mis{" "}
          <span
            className="text-[#1b2c44]"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            Pagos
          </span>
        </h1>
      </div>

      <div className="max-w-2xl mx-auto">
        {studio?.stripe_account_id ? (
          <div className="bg-white rounded-2xl p-6">
            <p className="font-medium text-slate-800 mb-1">
              Cuenta bancaria conectada
            </p>
            <p className="text-md text-slate-600">
              Tu cuenta de Stripe está activa y lista para recibir pagos.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-6 flex flex-col items-center gap-4 text-center">
            <CreditCard size={36} className="text-slate-300" />
            <p className="font-medium text-slate-800">Sin cuenta bancaria</p>
            <p className="text-md text-slate-600">
              Conecta tu cuenta bancaria para recibir pagos de tus clases.
            </p>
            <button
              onClick={handleConnectAccount}
              disabled={loading}
              className="bg-[#1b2c44] text-white px-6 py-2.5 rounded-xl text-md font-medium hover:bg-[#33506f] transition-colors cursor-pointer"
            >
              {loading ? "Conectando..." : "Conectar cuenta bancaria"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default OwnerEstudioPagos;
