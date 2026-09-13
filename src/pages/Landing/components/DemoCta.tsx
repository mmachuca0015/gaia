import { useState } from "react";

import { api } from "../../../lib/api";

function DemoCta() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  /* Reusa el endpoint de waitlist que ya existe: guarda el correo y desde ahi
     se agenda el demo a mano. */
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
          DEMO
        </p>
        <h2
          className="text-4xl md:text-5xl font-semibold text-white leading-tight mb-5"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Conoce wellco
          <br />
          <span className="italic">en 15 minutos</span>
        </h2>
        <p className="text-slate-400 mb-10 leading-relaxed">
          Te mostramos el panel con tus propios horarios y resolvemos cualquier
          duda. Gratis y sin compromiso.
        </p>

        {sent ? (
          <p className="text-white font-medium">
            Listo. Te escribimos para agendar tu demo.
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
                Agenda un demo gratis
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
