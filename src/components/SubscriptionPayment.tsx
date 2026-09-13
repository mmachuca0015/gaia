import { useEffect, useState } from "react";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Lock } from "lucide-react";

import { api } from "../lib/api";
import { stripePromise } from "../lib/stripe";
import { formatMoney } from "../lib/plans";

type Props = {
  onSuccess: () => void;
  /** Texto del boton. El registro y el panel lo nombran distinto. */
  cta?: string;
};

/* Formulario interno. Va dentro del <Elements> con clientSecret, porque
   useStripe y useElements solo funcionan ahi adentro. */
function PaymentFields({
  amount,
  currency,
  onSuccess,
  cta,
}: {
  amount: number | null;
  currency: string;
  onSuccess: () => void;
  cta: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");

  const handlePay = async () => {
    if (!stripe || !elements) return;
    setPaying(true);
    setError("");

    // redirect: "if_required" mantiene al dueño dentro de la app. Solo se sale
    // si el banco pide 3D Secure, y en ese caso vuelve al panel.
    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/panel-de-control`,
      },
      redirect: "if_required",
    });

    if (stripeError) {
      setError(stripeError.message || "No pudimos procesar el pago");
      setPaying(false);
      return;
    }

    // El cobro se confirmo. Quien marca la suscripcion como activa es el
    // webhook, no esta pantalla: aqui solo se avanza.
    onSuccess();
  };

  return (
    <div className="flex flex-col gap-4">
      <PaymentElement />

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      <button
        onClick={handlePay}
        disabled={!stripe || paying}
        className="bg-[#1b2c44] text-white py-3 rounded-xl text-sm font-medium hover:bg-[#33506f] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {paying
          ? "Procesando..."
          : amount !== null
            ? `${cta} · $${formatMoney(Math.round(amount / 100))} ${currency.toUpperCase()}`
            : cta}
      </button>

      <p className="text-xs text-slate-400 flex items-center justify-center gap-1.5">
        <Lock size={11} />
        Tu tarjeta se guarda con Stripe para la renovación automática. Wellco
        nunca la ve.
      </p>
    </div>
  );
}

/* Cobro de la suscripcion dentro de la app.
   Pide el clientSecret al backend y monta Elements con el. */
function SubscriptionPayment({ onSuccess, cta = "Pagar" }: Props) {
  const [clientSecret, setClientSecret] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [currency, setCurrency] = useState("mxn");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api("/subscriptions/payment-intent", { method: "POST" })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "No pudimos preparar el pago");
          return;
        }
        setClientSecret(data.clientSecret);
        setAmount(data.amount ?? null);
        setCurrency(data.currency || "mxn");
      })
      .catch(() => !cancelled && setError("No pudimos preparar el pago"));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <p className="text-sm text-slate-500 bg-slate-50 rounded-xl px-4 py-3">
        {error}
      </p>
    );
  }

  if (!clientSecret) {
    return <div className="h-40 rounded-xl bg-slate-50 animate-pulse" />;
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#1b2c44",
            colorText: "#1e293b",
            borderRadius: "12px",
            fontFamily: "Jost, system-ui, sans-serif",
          },
        },
      }}
    >
      <PaymentFields
        amount={amount}
        currency={currency}
        onSuccess={onSuccess}
        cta={cta}
      />
    </Elements>
  );
}

export default SubscriptionPayment;
