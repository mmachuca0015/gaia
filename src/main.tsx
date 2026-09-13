import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Elements } from "@stripe/react-stripe-js";
import "leaflet/dist/leaflet.css";
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
