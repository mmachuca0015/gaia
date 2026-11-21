import { useState } from "react";

import { api } from "../../../lib/api";

// Numero de WhatsApp para que los estudios escriban, en formato internacional
// y solo digitos (52 + 10 digitos para Mexico). Sale de una variable de entorno
// para cambiarlo sin tocar codigo; Vite lo integra al compilar, asi que
// cambiarlo en Render exige reconstruir wellco-web.
//
// Mientras este vacia, la seccion pide el correo y lo guarda en la waitlist,
// para que la landing nunca se quede sin forma de contacto.
const WHATSAPP_NUMBER = (import.meta.env.VITE_WHATSAPP_NUMBER || "").replace(
  /\D/g,
  "",
);
const WHATSAPP_TEXT = "Hola, me interesa Wellco para mi estudio.";
const WHATSAPP_URL = WHATSAPP_NUMBER
  ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_TEXT)}`
  : "";

function DemoCta() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleDemo = async () => {
    if (!email) return;
    setError("");
    const res = await api("/users/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) setSent(true);
    else setError("No pudimos registrar tu correo. Intenta de nuevo.");
  };

  return (
    <section id="demo" className="bg-ink py-24 px-6">
      <div className="max-w-2xl mx-auto text-center">
        <p className="text-[11px] tracking-[0.25em] text-slate-400 mb-6">
          CONTACTO
        </p>
        <h2
          className="text-4xl md:text-5xl font-semibold text-white leading-tight mb-5"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          ¿Tienes dudas?
          <br />
          <span className="italic">Escríbenos</span>
        </h2>
        <p className="text-slate-400 mb-10 leading-relaxed">
          Cuéntanos de tu estudio y te explicamos cómo funciona Wellco. Sin
          compromiso.
        </p>

        {WHATSAPP_URL ? (
          <>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-7 py-3.5 rounded-full bg-white text-ink text-sm font-medium hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Escríbenos por WhatsApp
            </a>
            <p className="text-slate-500 text-xs mt-5">
              Se abre WhatsApp con el mensaje listo. Te respondemos lo antes
              posible.
            </p>
          </>
        ) : sent ? (
          <p className="text-white font-medium">
            Listo. Te escribimos pronto.
          </p>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <input
                type="email"
                placeholder="correo@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="px-5 py-3.5 rounded-full bg-white text-ink text-sm outline-none w-full sm:w-80 placeholder:text-slate-400"
              />
              <button
                onClick={handleDemo}
                className="px-7 py-3.5 rounded-full bg-white text-ink text-sm font-medium hover:bg-slate-200 transition-colors cursor-pointer whitespace-nowrap"
              >
                Quiero que me contacten
              </button>
            </div>
            {error && <p className="text-slate-400 text-sm mt-4">{error}</p>}
          </>
        )}
      </div>
    </section>
  );
}

export default DemoCta;
