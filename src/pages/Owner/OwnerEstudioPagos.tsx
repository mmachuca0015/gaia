import { ArrowLeft, CreditCard } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

function OwnerEstudioPagos() {
  const navigate = useNavigate();

  type Studio = {
    id: string;
    stripe_account_id: string;
  };

  const owner = JSON.parse(localStorage.getItem("user") || "{}");
  const [studio, setStudio] = useState<Studio | null>(null);
  useEffect(() => {
    fetch(`http://localhost:3001/studios/owner/${owner.id}`)
      .then((res) => res.json())
      .then((data) => setStudio(data));
  }, []);

  const handleConnectAccount = async () => {
    const res = await fetch(
      "http://localhost:3001/payments/create-connect-account",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studioId: studio?.id }),
      },
    );
    const data = await res.json();
    if (res.ok) {
      window.location.href = data.url;
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
          className="text-[#3a5a3a] cursor-pointer"
        />
        <h1
          className="text-4xl md:text-6xl font-semibold text-stone-800"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Mis{" "}
          <span
            className="italic text-[#3a5a3a]"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            Pagos
          </span>
        </h1>
      </div>

      <div className="max-w-2xl mx-auto">
        {studio?.stripe_account_id ? (
          <div className="bg-white rounded-2xl p-6">
            <p className="font-medium text-stone-800 mb-1">
              Cuenta bancaria conectada
            </p>
            <p className="text-md text-stone-600">
              Tu cuenta de Stripe está activa y lista para recibir pagos.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-6 flex flex-col items-center gap-4 text-center">
            <CreditCard size={36} className="text-stone-300" />
            <p className="font-medium text-stone-800">Sin cuenta bancaria</p>
            <p className="text-md text-stone-600">
              Conecta tu cuenta bancaria para recibir pagos de tus clases.
            </p>
            <button
              onClick={handleConnectAccount}
              disabled={loading}
              className="bg-[#3a5a3a] text-white px-6 py-2.5 rounded-xl text-md font-medium hover:bg-[#2e4a2e] transition-colors cursor-pointer"
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
