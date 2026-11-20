// Correos del reembolso de soporte (services/adminRefund.js): uno al alumno y
// otro al estudio. Los dos nunca lanzan (`enviar` de mailer.js): un correo que
// no sale no debe deshacer un reembolso que Stripe ya hizo.
const { fechaLarga, pesos, plantilla, enviar } = require("./mailer");

// El motivo lo escribe el admin y va dentro del HTML del correo.
function escapar(texto) {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const MARCAS = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
};

function claseLinea(b) {
  const fecha = b.class_date ? fechaLarga(b.class_date) : null;
  const hora = b.time ? `, ${b.time}` : "";
  return `${escapar(b.class_name)} en ${escapar(b.studio_name)}${
    fecha ? ` · ${fecha}${hora}` : ""
  }`;
}

async function sendRefundToStudent({ booking: b, card }) {
  const tarjeta = card
    ? `tu tarjeta ${MARCAS[card.brand] ?? card.brand} terminación ${card.last4}`
    : "la tarjeta con la que pagaste";
  const cuerpo = `
  <p style="margin:0 0 12px">Hola ${escapar(b.user_name)},</p>
  <p style="margin:0 0 12px">
    Hubo un problema con tu clase y te reembolsamos lo que pagaste por ella.
    Tu reserva quedó cancelada.
  </p>
  <p style="margin:0 0 8px"><strong>Clase:</strong> ${claseLinea(b)}</p>
  <p style="margin:0 0 8px"><strong>Reembolso:</strong> $${pesos(b.price_cents)} MXN a ${tarjeta}.</p>
  <p style="margin:16px 0 0;font-size:14px;color:#33506f">
    Tu banco lo refleja en 5 a 10 días hábiles. El cargo por servicio de
    Wellco no es reembolsable.
  </p>`;
  return enviar({
    to: b.user_email,
    subject: `Te reembolsamos tu clase de ${b.class_name}`,
    html: plantilla("Reembolso de tu clase", cuerpo),
  });
}

async function sendRefundToStudio({ booking: b, recoveredCents, reason }) {
  const alumno = escapar(`${b.user_name} ${b.user_last_name ?? ""}`.trim());
  const motivo = reason
    ? `<p style="margin:0 0 8px"><strong>Motivo:</strong> ${escapar(reason)}</p>`
    : "";
  const cuerpo = `
  <p style="margin:0 0 12px">Hola ${escapar(b.owner_name)},</p>
  <p style="margin:0 0 12px">
    Soporte de Wellco reembolsó a un alumno por una clase de tu estudio. La
    reserva quedó cancelada y su lugar libre.
  </p>
  <p style="margin:0 0 8px"><strong>Alumno:</strong> ${alumno}</p>
  <p style="margin:0 0 8px"><strong>Clase:</strong> ${claseLinea(b)}</p>
  ${motivo}
  <p style="margin:0 0 8px"><strong>Se devolvió al alumno:</strong> $${pesos(b.price_cents)} MXN</p>
  <p style="margin:0 0 8px"><strong>Se descontó de tu cuenta de Stripe:</strong> $${pesos(recoveredCents)} MXN, lo que recibiste por esa reserva.</p>
  <p style="margin:16px 0 0;font-size:14px;color:#33506f">
    Lo ves en Estudio &gt; Pagos y en tu panel de Stripe.
  </p>`;
  return enviar({
    to: b.owner_email,
    subject: `Reembolso a un alumno de ${b.studio_name}`,
    html: plantilla("Reembolsamos a un alumno", cuerpo),
  });
}

module.exports = { sendRefundToStudent, sendRefundToStudio };
