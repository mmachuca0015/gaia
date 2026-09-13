import { useState } from "react";

import { api } from "../../../lib/api";
function Waitlist() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const handleWaitlist = async () => {
    if (!email) return;
    const res = await api("/users/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) setSent(true);
  };

  return (
    <section id="waitlist" className="bg-[#3a5a3a] py-24 px-6 text-center">
      <div className="max-w-2xl mx-auto">
        <p className="text-xs tracking-[0.3em] text-stone-300 mb-6">CONTACTO</p>
        <h2
          className="text-4xl md:text-5xl font-semibold text-white leading-tight mb-6"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          ¿Te interesa ser de{" "}
          <span className="italic text-stone-300">los primeros?</span>
        </h2>
        <p className="text-stone-300 mb-10">
          PILA está en camino. Escríbenos y te avisamos en cuanto abramos.
        </p>

        {sent ? (
          <p className="text-white font-medium">
            ¡Listo! Te avisamos cuando estemos listos 🌿
          </p>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <input
              type="email"
              placeholder="correo@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="px-5 py-3 rounded-full bg-white text-stone-600 text-sm outline-none w-full sm:w-80"
            />
            <button
              onClick={handleWaitlist}
              className="px-6 py-3 rounded-full border border-white text-white text-sm font-medium hover:bg-white hover:text-[#3a5a3a] transition-colors cursor-pointer"
            >
              Avisame cuando esté lista
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

export default Waitlist;
