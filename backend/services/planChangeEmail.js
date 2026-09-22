// Correo al estudio cuando el admin le cambia el plan.
//
// El estudio no pidio este cambio (lo hace soporte, para ayudarlo o para
// arreglarle una situacion), asi que el correo tiene que dejar tres cosas sin
// ambiguedad: que plan tiene ahora, cuanto y cuando se le cobra, y que incluye.
const { fechaLarga, pesos, plantilla, enviar } = require("./mailer");

/**
 * Las lineas de lo que incluye el plan. Es el gemelo de `planFeatureLines`
 * (src/lib/plans.ts): las dos arman la lista con las columnas del plan
 * (sucursales y avisos) y luego con las filas de `plan_features`.
 *
 * Se escribe dos veces porque una corre en el navegador y la otra dentro del
 * correo; si se agrega otra caracteristica de columna, van las dos.
 */
function planLines(plan) {
  const lineas = [
    plan.max_studios === 1
      ? "1 sucursal"
      : `Hasta ${plan.max_studios} sucursales`,
  ];
  if (plan.notices) lineas.push("Avisos a tus alumnos");
  return [...lineas, ...(plan.features ?? [])];
}

/**
 * @param email        correo de la cuenta del dueño
 * @param ownerName    su nombre
 * @param studioName   como se llama su estudio
 * @param plan         { name, max_studios, notices, features[] }
 * @param amountCents  lo que se le va a cobrar, sin IVA
 * @param interval     "month" | "year"
 * @param immediate    true si el plan ya cambio; false si entra al renovar
 * @param appliesOn    "YYYY-MM-DD" desde cuando aplica (null = hoy)
 * @param nextChargeOn "YYYY-MM-DD" del proximo cobro, si se conoce
 */
async function sendPlanChange({
  email,
  ownerName,
  studioName,
  plan,
  amountCents,
  interval,
  immediate,
  appliesOn,
  nextChargeOn,
}) {
  const cada = interval === "year" ? "al año" : "al mes";

  // El precio se guarda SIN IVA y Stripe lo agrega como impuesto en la
  // factura. El correo dice "+ IVA" igual que la app: inflar el numero aqui
  // haria que no cuadre con el recibo de Stripe.
  const monto = `$${pesos(amountCents)} MXN + IVA ${cada}`;

  const cuando = immediate
    ? "Tu plan ya está activo."
    : `Tu plan cambia el ${fechaLarga(appliesOn)}. Hasta ese día sigues con el que tienes, que ya está pagado.`;

  const cobro = nextChargeOn
    ? `<p style="margin:0 0 8px"><strong>Próximo cobro:</strong> ${fechaLarga(nextChargeOn)}, por ${monto}.</p>`
    : `<p style="margin:0 0 8px"><strong>Cobro:</strong> ${monto}.</p>`;

  // Solo en el cambio inmediato: Stripe abona lo que no se uso del plan
  // anterior y cobra lo que queda del nuevo. Decirlo evita el correo de
  // "¿por que mi recibo trae otro monto?".
  const ajuste = immediate
    ? `<p style="margin:16px 0 0;font-size:14px;color:#33506f">
         Como el cambio entró a mitad de tu periodo, en tu próximo recibo verás
         un ajuste: se te descuenta lo que no usaste del plan anterior y se
         cobra solo la parte que falta del nuevo.
       </p>`
    : "";

  const lista = planLines(plan)
    .map((l) => `<li style="margin-bottom:6px">${l}</li>`)
    .join("");

  return enviar({
    to: email,
    subject: `Tu plan de Wellco ahora es ${plan.name}`,
    html: plantilla(
      `Hola ${ownerName}, tu plan cambió a ${plan.name}`,
      `<p style="margin:0 0 16px">
         Hicimos el cambio en la cuenta de <strong>${studioName}</strong>. ${cuando}
       </p>
       ${cobro}
       <p style="margin:20px 0 8px"><strong>Lo que incluye tu plan ${plan.name}:</strong></p>
       <ul style="margin:0;padding-left:20px;color:#33506f">${lista}</ul>
       ${ajuste}`,
    ),
  });
}

module.exports = { sendPlanChange, planLines };
