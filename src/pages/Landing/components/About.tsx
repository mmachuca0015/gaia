import iphonePreview from "../../../assets/iphone-preview.png";
function About() {
  return (
    <section className="bg-[#f0e8d8] py-24 px-6">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center gap-16">
        {/* Mockup del teléfono */}
        <div className="flex-shrink-0">
          <img
            src={iphonePreview}
            alt="PILA app preview"
            className="w-55 drop-shadow-xl"
          />
        </div>

        {/* Texto */}
        <div>
          <p className="text-xs tracking-[0.3em] text-stone-400 mb-4">
            SOBRE LA APP
          </p>
          <h2
            className="text-4xl md:text-5xl font-semibold text-stone-800 leading-tight mb-6"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            PILA WELLNESS,{" "}
            <span className="italic text-[#3a5a3a]">tu compañero</span> de
            bienestar
          </h2>
          <p className="text-stone-500 text-base mb-4 leading-relaxed">
            PILA es una plataforma diseñada para conectar a los amantes del
            pilates con los mejores estudios de su ciudad. Para los clientes,
            significa libertad: encuentra el estudio ideal, revisa horarios y
            reserva en segundos.
          </p>
          <p className="text-stone-500 text-base leading-relaxed">
            Para los dueños de estudio, significa visibilidad y control: lleva
            tu negocio al siguiente nivel con una herramienta hecha para el
            mundo del bienestar.
          </p>
        </div>
      </div>
    </section>
  );
}

export default About;
