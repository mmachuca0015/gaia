import { ChevronLeft, CreditCard } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import PaymentForm from "../../components/PaymentForm";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

import { api } from "../../lib/api";
function AgregarTarjeta() {
  const navigate = useNavigate();

  type CardData = {
    brand: string;
    last4: string;
  };

  // Si el usuario ya tiene tarjeta se sabe desde el primer render, leyendo el
  // localStorage: es estado inicial, no algo que un efecto tenga que corregir
  // despues pintando una vez la pantalla equivocada.
  const [hasCard, setHasCard] = useState<boolean>(
    () => !!JSON.parse(localStorage.getItem("user") || "{}").stripe_customer_id,
  );
  const [showForm, setShowForm] = useState<boolean>(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [cardData, setCardData] = useState<CardData | null>(null);

  useEffect(() => {
    if (!showForm) return;
    api("/payments/create-setup-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
      .then((response) => response.json())
      .then((data) => setClientSecret(data.clientSecret));
  }, [showForm]);

  useEffect(() => {
    if (!hasCard) return;
    api("/payments/card")
      .then((res) => res.json())
      .then((data) => setCardData(data));
    // Solo al montar: la tarjeta recien guardada la pone el onSuccess del
    // formulario, no hace falta volver a pedirla aqui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeleteCard = async () => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    await api("/payments/card", { method: "DELETE" });

    // Actualizar localStorage
    localStorage.setItem(
      "user",
      JSON.stringify({ ...user, stripe_customer_id: null }),
    );

    setHasCard(false);
    setCardData(null);
  };

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <ChevronLeft
          size={22}
          onClick={() => navigate("/perfil")}
          className="text-[#1b2c44] cursor-pointer"
        />
        <h1
          className="text-4xl md:text-6xl font-semibold text-slate-800"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Agregar <span className="text-[#1b2c44]">tarjeta</span>
        </h1>
      </div>

      <div className="max-w-2xl mx-auto">
        {hasCard ? (
          <div className="bg-white rounded-2xl p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <CreditCard size={26} className="text-slate-600" />
              <div>
                <p className="text-md text-slate-600">
                  {cardData
                    ? `${cardData.brand.charAt(0).toUpperCase() + cardData.brand.slice(1)} •••• ${cardData.last4}`
                    : ""}
                </p>
              </div>
            </div>
            <button
              onClick={handleDeleteCard}
              className="text-md text-red-400 hover:text-red-600 transition-colors cursor-pointer"
            >
              Eliminar
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-10 flex flex-col items-center gap-4 text-center">
            {showForm ? (
              <div className="w-full flex flex-col gap-4">
                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                  {showForm && clientSecret && (
                    <Elements
                      stripe={loadStripe(
                        import.meta.env.VITE_STRIPE_PUBLIC_KEY,
                      )}
                      options={{
                        clientSecret,
                        paymentMethodCreation: "manual",
                      }}
                    >
                      <PaymentForm
                        onSuccess={() => {
                          api("/payments/card")
                            .then((res) => res.json())
                            .then((data) => {
                              setCardData(data);
                              setHasCard(true);
                            });
                        }}
                      />
                    </Elements>
                  )}
                </div>
                <button
                  onClick={() => setShowForm(false)}
                  className="text-sm text-slate-400 cursor-pointer hover:text-slate-600"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <>
                <CreditCard size={36} className="text-slate-400" />
                <p className="text-slate-600 text-md">
                  Aún no has agregado una tarjeta
                </p>
                <button
                  onClick={() => setShowForm(true)}
                  className="bg-[#1b2c44] text-white px-6 py-2.5 rounded-xl text-md font-medium hover:bg-[#33506f] transition-colors cursor-pointer mt-2"
                >
                  Agregar tarjeta
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AgregarTarjeta;
