// Instancia unica de Stripe.js.
//
// Vive aparte de main.tsx porque el pago de la suscripcion necesita su propio
// <Elements> anidado, con el clientSecret de esa suscripcion. loadStripe hace
// cache interno, pero exportarla evita depender de ese detalle.
import { loadStripe } from "@stripe/stripe-js";

export const stripePromise = loadStripe(
  import.meta.env.VITE_STRIPE_PUBLIC_KEY,
);
