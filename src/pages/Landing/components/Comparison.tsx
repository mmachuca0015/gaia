import { Check, X } from "lucide-react";

const groups = [
  {
    audience: "Si vas a clase",
    without: [
      "Escribir por WhatsApp y esperar respuesta para saber si hay lugar",
      "Registrarte de nuevo en cada estudio al que quieres ir",
      "Transferencias y capturas de pantalla como comprobante",
      "Descubrir estudios nuevos solo de boca en boca",
    ],
    with: [
      "Horarios y lugares disponibles en tiempo real, sin preguntarle a nadie",
      "Un perfil y un método de pago para todos los estudios",
      "Pago con tarjeta vía Stripe y confirmación por correo",
      "Todos los estudios de tu zona en un mismo buscador con mapa",
    ],
  },
  {
    audience: "Si tienes un estudio",
    without: [
      "Agenda en papel o en una hoja de cálculo que nadie más entiende",
      "Contar los ingresos del mes a mano, al final del mes",
      "Depender de redes sociales para que te encuentren",
      "Pagar licencia de software caro y aun así cobrar aparte",
    ],
    with: [
      "Agenda, cupos y reservaciones sincronizados solos",
      "Ingresos del día, la semana o el semestre con gráfica al momento",
      "Clientes nuevos que llegan desde el marketplace sin que pagues anuncios",
      "Cobro integrado con Stripe Connect: el dinero cae en tu cuenta",
    ],
  },
];

function Comparison() {
  return (
    <section id="comparativa" className="bg-surface py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-[11px] tracking-[0.25em] text-slate-400 mb-4">
            COMPARATIVA
          </p>
          <h2
            className="text-4xl md:text-5xl font-semibold text-ink leading-tight"
            style={{ fontFamily: "Cormorant Garamond, serif" }}
          >
            Cómo se ve el día a día
            <br />
            <span className="italic">con y sin wellco</span>
          </h2>
        </div>

        <div className="flex flex-col gap-8">
          {groups.map((g) => (
            <div key={g.audience}>
              <p className="text-sm font-medium text-ink mb-4">{g.audience}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-paper border border-line rounded-2xl p-6">
                  <p className="text-xs tracking-[0.2em] text-slate-400 mb-5">
                    SIN WELLCO
                  </p>
                  <ul className="flex flex-col gap-3">
                    {g.without.map((item) => (
                      <li key={item} className="flex gap-3 items-start">
                        <X
                          size={15}
                          className="text-slate-400 mt-0.5 shrink-0"
                        />
                        <span className="text-sm text-slate-500 leading-relaxed">
                          {item}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-ink rounded-2xl p-6">
                  <p className="text-xs tracking-[0.2em] text-slate-400 mb-5">
                    CON WELLCO
                  </p>
                  <ul className="flex flex-col gap-3">
                    {g.with.map((item) => (
                      <li key={item} className="flex gap-3 items-start">
                        <Check size={15} className="text-white mt-0.5 shrink-0" />
                        <span className="text-sm text-slate-200 leading-relaxed">
                          {item}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Comparison;
