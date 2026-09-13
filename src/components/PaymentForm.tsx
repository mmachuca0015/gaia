import {
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

import { api } from "../lib/api";
function PaymentForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();

  const handleSaveCard = async () => {
    if (!stripe || !elements) return;

    const { error, setupIntent } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: "http://localhost:5173/perfil/agregar-tarjeta",
      },
      redirect: "if_required",
    });

    if (error) {
      console.log(error.message);
      return;
    }

    // Mandar el paymentMethodId al backend
    const user = JSON.parse(localStorage.getItem("user") || "{}");

    const res = await api("/payments/save-card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentMethodId: setupIntent?.payment_method,
      }),
    });
    const data = await res.json();

    // Actualizar localStorage con el nuevo stripe_customer_id
    localStorage.setItem(
      "user",
      JSON.stringify({ ...user, stripe_customer_id: data.customerId }),
    );

    onSuccess();
  };

  return (
    <div className="w-full flex flex-col gap-4">
      <PaymentElement />
      <button
        onClick={handleSaveCard}
        className="bg-[#3a5a3a] text-white py-2.5 rounded-xl text-sm font-medium hover:bg-[#2e4a2e] transition-colors cursor-pointer"
      >
        Guardar tarjeta
      </button>
    </div>
  );
}

export default PaymentForm;
