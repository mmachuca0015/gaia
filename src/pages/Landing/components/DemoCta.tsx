import { useState } from "react";

import { api } from "../../../lib/api";

// Pagina de reservas de Google Calendar. Sale de una variable de entorno y no
// del codigo porque no existe hasta que Workspace esta contratado y el horario
// de citas creado.
//
// Mientras este vacia, la seccion se queda como estaba: pide el correo y lo
// guarda en la waitlist para agendar a mano. Asi la landing en produccion
// sigue funcionando entre hoy y el dia que se pegue la URL, sin desplegar
// codigo nuevo: basta con llenar la variable en Render.
const BOOKING_URL = import.meta.env.VITE_DEMO_BOOKING_URL || "";

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
          DEMO
        </p>
        <h2
          className="text-4xl md:text-5xl font-semibold text-white leading-tight mb-5"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Conoce Wellco
          <br />
          <span className="italic">en 30 minutos</span>
        </h2>
        <p className="text-slate-400 mb-10 leading-relaxed">
          Te mostramos el panel con tus propios horarios y resolvemos cualquier
          duda. Gratis y sin compromiso.
        </p>

        {BOOKING_URL ? (
          <>
            {/* Google pide el nombre y el correo en su propia pantalla, crea la
                videollamada y manda la invitacion a las dos partes. Pedir aqui
                el correo obligaria a escribirlo dos veces. */}
            <a
              href={BOOKING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-7 py-3.5 rounded-full bg-white text-ink text-sm font-medium hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Elige el dia y la hora
            </a>
            <p className="text-slate-500 text-xs mt-5">
              Se abre el calendario de Wellco. Recibes la invitacion con el
              enlace de la videollamada en tu correo.
            </p>
          </>
        ) : sent ? (
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
