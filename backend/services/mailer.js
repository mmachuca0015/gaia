// Lo comun de los correos que salen del backend: el remitente, la envoltura
// HTML, las fechas en español y el envio que nunca truena hacia afuera.
//
// Estaba dentro de closureEmail.js, donde nacio. Se saco al agregar el correo
// de cambio de plan: dos copias de la plantilla acaban con dos pies de pagina
// distintos, y la fecha en español es justo lo que no se debe reescribir.
const { Resend } = require("resend");

// El cliente se arma la primera vez que se usa, no al cargar el archivo:
// `new Resend()` truena si falta la llave, y estos modulos los carga el
// webhook de suscripciones. Sin esto, un entorno sin RESEND_API_KEY no arranca.
let resend = null;
const cliente = () => (resend ??= new Resend(process.env.RESEND_API_KEY));

const FROM = "Wellco <no-reply@wellcoapp.com>";

// A donde llegan los reportes internos.
const ADMIN_EMAIL = "mmachuca@wellcoapp.com";

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

// "1 de octubre de 2026" desde un "YYYY-MM-DD". Se arma a mano y no con
// toLocaleDateString del servidor: el de Render esta en ingles.
//
// Siempre recibe texto, nunca un Date: las consultas ya traen la fecha con
// to_char en hora de Mexico. Un DATE convertido a Date por pg se corre un dia
// cuando el servidor corre en UTC, y quien lo lee ve la fecha equivocada.
function fechaLarga(ymd) {
  const [y, m, d] = String(ymd).slice(0, 10).split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

const pesos = (centavos) => (centavos / 100).toFixed(2);

// Envoltura comun: mismo encabezado y mismo pie para todos los correos.
function plantilla(titulo, cuerpo) {
  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#1b2c44">
  <h1 style="font-size:22px;margin:0 0 16px">${titulo}</h1>
  ${cuerpo}
  <p style="font-size:13px;color:#64748b;margin-top:28px;border-top:1px solid #e0e7ef;padding-top:16px">
    Wellco · Si tienes dudas, responde a este correo.
  </p>
</div>`;
}

/**
 * Manda y devuelve si salio. NUNCA lanza: un correo que no sale no debe
 * deshacer un abono que ya se dio, una devolucion que Stripe acepto ni un
 * cambio de plan que ya se aplico.
 */
async function enviar(opciones) {
  try {
    // El SDK de Resend NO lanza cuando el envio falla: devuelve { error }. Sin
    // revisarlo, un correo rechazado (llave invalida, dominio sin verificar,
    // destinatario malo) se anotaba como enviado y nadie se enteraba.
    const { error } = await cliente().emails.send({ from: FROM, ...opciones });
    if (error) {
      console.error("No se pudo enviar el correo:", error.message ?? error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("No se pudo enviar el correo:", err.message);
    return false;
  }
}

module.exports = { FROM, ADMIN_EMAIL, fechaLarga, pesos, plantilla, enviar };
