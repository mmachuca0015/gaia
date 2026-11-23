import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Elements } from "@stripe/react-stripe-js";
import "leaflet/dist/leaflet.css";
// Pin de la marca como icono por defecto de todos los mapas.
import "./lib/mapPin";
import "./index.css";
import App from "./App";
import { stripePromise } from "./lib/stripe";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Elements stripe={stripePromise}>
      <App />
    </Elements>
  </StrictMode>,
);
