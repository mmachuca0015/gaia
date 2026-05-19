import { useNavigate } from "react-router-dom";

function Hero() {
  const navigate = useNavigate();

  return (
    <section className="relative min-h-screen bg-[#f6eee2] flex flex-col items-center justify-center text-center px-6 overflow-hidden">
      {/* Ilustración de círculos en el fondo */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10">
        <div className="w-[800px] h-[800px] rounded-full border border-stone-400" />
        <div className="absolute w-[600px] h-[600px] rounded-full border border-stone-400" />
        <div className="absolute w-[400px] h-[400px] rounded-full border border-stone-400" />
        <div className="absolute w-[900px] h-[500px] rounded-full border border-stone-400 rotate-45" />
        <div className="absolute w-[700px] h-[400px] rounded-full border border-stone-400 -rotate-45" />
      </div>

      {/* Contenido */}
      <div className="relative z-10 max-w-3xl">
        <p className="text-xs tracking-[0.3em] text-stone-500 mb-4">
          PILA · WELLNESS
        </p>

        <span className="inline-block border border-stone-400 text-stone-500 text-xs tracking-widest px-4 py-1.5 rounded-full mb-8">
          · PRÓXIMAMENTE
        </span>

        <h1
          className="text-5xl md:text-7xl font-semibold text-stone-800 leading-tight mb-6"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          El estudio de pilates{" "}
          <span className="italic text-[#3a5a3a]">que se adapta</span> a ti
        </h1>

        <p className="text-base md:text-lg text-stone-500 mb-10 max-w-xl mx-auto">
          Muy pronto podrás explorar estudios, reservar clases y cuidar tu
          cuerpo — todo en un solo lugar.
        </p>

        <button
          onClick={() =>
            document
              .getElementById("waitlist")
              ?.scrollIntoView({ behavior: "smooth" })
          }
          className="bg-[#3a5a3a] text-white px-8 py-4 rounded-full text-sm font-medium hover:bg-[#2e4a2e] transition-colors cursor-pointer"
        >
          Quiero ser de los primeros
        </button>
      </div>

      {/* Scroll */}
      <p className="absolute bottom-8 text-xs tracking-[0.3em] text-stone-400">
        SCROLL
      </p>
    </section>
  );
}

export default Hero;
