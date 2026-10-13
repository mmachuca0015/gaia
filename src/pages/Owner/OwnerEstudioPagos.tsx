import { ArrowLeft, CreditCard } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

import { apiJson } from "../../lib/api";

type ConnectStatus = {
  connected: boolean;
  /** Stripe ya le puede transferir: es lo que pide el catalogo para publicar. */
  ready: boolean;
  details_submitted?: boolean;
};

function OwnerEstudioPagos() {
  const navigate = useNavigate();

  // El estado se le pregunta a Stripe cada vez que se abre la pantalla. Es
  // tambien a donde Stripe regresa al terminar el alta, asi que al volver de
  // ahi el estudio queda marcado como listo para publicarse.
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    apiJson<ConnectStatus>("/payments/connect-status")
      .then(setStatus)
      .catch(() => setLoadError("No pudimos revisar tu cuenta de Stripe."));
  }, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleConnectAccount = async () => {
    setLoading(true);
    setError("");
    try {
      // El dueño lo determina el backend a partir de la sesion.
      const data = await apiJson<{ url: string }>(
        "/payments/create-connect-account",
        { method: "POST" },
      );
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al conectar");
      setLoading(false);
    }
  };

  const button = (label: string) => (
    <button
      onClick={handleConnectAccount}
      disabled={loading}
      className="bg-[#1b2c44] text-white px-6 py-2.5 rounded-xl text-md font-medium hover:bg-[#33506f] transition-colors cursor-pointer disabled:opacity-60"
    >
      {loading ? "Conectando..." : label}
    </button>
  );

  return (
    <div className="p-4 md:p-8">
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
        {loadError ? (
          <p className="text-sm text-slate-500">{loadError}</p>
        ) : !status ? (
          <p className="text-sm text-slate-500">Cargando...</p>
        ) : status.ready ? (
          <div className="bg-white rounded-2xl p-6">
            <p className="font-medium text-slate-800 mb-1">
              Cuenta bancaria conectada
            </p>
            <p className="text-md text-slate-600">
              Tu cuenta de Stripe está activa y lista para recibir pagos. La
              usan todas tus sucursales.
            </p>
          </div>
        ) : status.connected ? (
          <div className="bg-white rounded-2xl p-6 flex flex-col items-center gap-4 text-center">
            <CreditCard size={36} className="text-amber-400" />
            <p className="font-medium text-slate-800">
              {status.details_submitted
                ? "Stripe está revisando tu cuenta"
                : "Te falta terminar el alta en Stripe"}
            </p>
            <p className="text-md text-slate-600">
              {status.details_submitted
                ? "Ya mandaste tus datos. Si Stripe te pide algo más, complétalo para poder recibir pagos y publicar tu estudio."
                : "Tu estudio no se publica hasta que Stripe pueda transferirte el dinero de tus clases."}
            </p>
            {button(
              status.details_submitted ? "Revisar en Stripe" : "Continuar alta",
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-6 flex flex-col items-center gap-4 text-center">
            <CreditCard size={36} className="text-slate-300" />
            <p className="font-medium text-slate-800">Sin cuenta bancaria</p>
            <p className="text-md text-slate-600">
              Conecta tu cuenta bancaria para recibir pagos de tus clases. Sin
              ella tu estudio no se publica.
            </p>
            {button("Conectar cuenta bancaria")}
          </div>
        )}
        {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
      </div>
    </div>
  );
}

export default OwnerEstudioPagos;
