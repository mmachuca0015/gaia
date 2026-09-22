// Los correos del cierre de una sucursal: dos al alumno y uno al admin.
//
// Ninguno truena hacia afuera. Un correo que no sale no debe deshacer un abono
// que ya se dio ni una devolucion que Stripe ya acepto: se anota en el log y
// la operacion sigue. Es la misma regla de bookingEmail.js.
const ExcelJS = require("exceljs");

// El remitente, la plantilla, las fechas en español y el envio que no truena
// son los mismos de todos los correos: viven en services/mailer.js.
const {
  ADMIN_EMAIL,
  fechaLarga,
  pesos,
  plantilla,
  enviar,
} = require("./mailer");

/**
 * Al alumno, cuando su sucursal cerro pero el estudio sigue abierto en otra.
 *
 * Lo que tiene que quedar clarisimo es que NO perdio su dinero: sus clases se
 * mudaron. Si el correo no lo dice en la primera linea, el alumno escribe
 * pidiendo un reembolso que no le toca.
 */
async function sendClosureCredit({ email, userName, closedBranch, newBranch, classes }) {
  const n = classes.length;
  const lista = classes
    .map(
      (c) =>
        `<li style="margin-bottom:4px">${c.name} · ${fechaLarga(c.date)}</li>`,
    )
    .join("");

  return enviar({
    to: email,
    subject: `Tus ${n === 1 ? "clase sigue" : "clases siguen"} a salvo: ${closedBranch} cerró`,
    html: plantilla(
      `Hola ${userName}, no perdiste tu dinero`,
      `<p style="line-height:1.6">
         La sucursal <strong>${closedBranch}</strong> dejó de operar, así que
         ${n === 1 ? "la clase que tenías reservada ahí no se va a dar" : `las ${n} clases que tenías reservadas ahí no se van a dar`}.
       </p>
       <p style="line-height:1.6">
         <strong>${n === 1 ? "Esa clase te quedó a favor" : `Esas ${n} clases te quedaron a favor`}</strong>
         en <strong>${newBranch}</strong>, del mismo estudio.
         ${n === 1 ? "La puedes usar" : "Las puedes usar"} sin pagar nada, en el horario que prefieras,
         durante los próximos 6 meses. ${n === 1 ? "Aparece" : "Aparecen"} en
         <em>Mis paquetes</em> dentro de tu cuenta.
       </p>
       <p style="line-height:1.6;margin-bottom:6px">Lo que tenías reservado:</p>
       <ul style="line-height:1.6;color:#33506f;padding-left:20px;margin-top:0">${lista}</ul>`,
    ),
  });
}

/**
 * Al alumno, cuando el estudio cerro del todo y se le devolvio el dinero.
 *
 * Dice por que no se le devuelve el 3%: si no lo explica, el alumno cuenta el
 * dinero, no le cuadra y escribe.
 */
async function sendClosureRefund({ email, userName, tipo, nombre, centavos, estudio }) {
  return enviar({
    to: email,
    subject: `Te devolvimos tu dinero: ${estudio} cerró`,
    html: plantilla(
      `Hola ${userName}, te devolvimos tu dinero`,
      `<p style="line-height:1.6">
         <strong>${estudio}</strong> cerró y ya no puede darte
         ${tipo === "Paquete" ? "las clases que te quedaban" : "la clase que reservaste"}.
       </p>
       <p style="line-height:1.6">
         Le pedimos a tu banco la devolución de <strong>$${pesos(centavos)} MXN</strong>
         por <em>${nombre}</em>. Tarda entre 5 y 10 días hábiles en aparecer en tu
         estado de cuenta, según tu banco.
       </p>
       <p style="line-height:1.6;font-size:14px;color:#64748b">
         La devolución cubre el precio completo de
         ${tipo === "Paquete" ? "las clases que no usaste" : "la clase"}. El cargo por
         servicio de la plataforma (3%) no se incluye.
       </p>`,
    ),
  });
}

/**
 * Al admin, con lo que no se pudo devolver solo.
 *
 * Un renglon por cosa pendiente, con el correo del alumno en su columna, para
 * poder ver a varios alumnos en el mismo archivo y cobrarlo a mano.
 */
function buildPendingWorkbook(pendientes) {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Wellco";
  const hoja = libro.addWorksheet("Pendientes de reembolso");

  hoja.columns = [
    { header: "Correo del alumno", key: "email", width: 32 },
    { header: "Alumno", key: "userName", width: 22 },
    { header: "Tipo", key: "tipo", width: 16 },
    { header: "Nombre", key: "nombre", width: 38 },
    { header: "Precio (MXN)", key: "precio", width: 14 },
    // Lo que Stripe se quedo del cobro original y no regresa. Hoy lo absorbe
    // Wellco; la columna esta para poder medirlo y, si se decide cobrarselo al
    // estudio, saber de cuanto se habla.
    { header: "Comisión de Stripe (MXN)", key: "comisionStripe", width: 22 },
    { header: "Estudio", key: "estudio", width: 26 },
    { header: "Fecha", key: "fecha", width: 16 },
    { header: "ID", key: "referencia", width: 10 },
  ];
  hoja.getRow(1).font = { bold: true };

  for (const p of pendientes) {
    hoja.addRow({
      email: p.email,
      userName: p.userName,
      tipo: p.tipo,
      nombre: p.nombre,
      precio: Number((p.centavos / 100).toFixed(2)),
      comisionStripe: Number(((p.comisionStripe ?? 0) / 100).toFixed(2)),
      estudio: p.estudio,
      fecha: fechaLarga(p.fecha),
      referencia: p.referencia,
    });
  }
  hoja.getColumn("precio").numFmt = '"$"#,##0.00';
  hoja.getColumn("comisionStripe").numFmt = '"$"#,##0.00';
  return libro;
}

async function sendNoFundsReport(studioName, pendientes) {
  const total = pendientes.reduce((n, p) => n + p.centavos, 0);
  const buffer = await buildPendingWorkbook(pendientes).xlsx.writeBuffer();

  return enviar({
    to: ADMIN_EMAIL,
    subject: `"${studioName}" cancelación de suscripción. Sin fondos para reembolsar alumnos.`,
    html: plantilla(
      "Reembolsos que no se pudieron hacer",
      `<p style="line-height:1.6">
         <strong>${studioName}</strong> canceló su suscripción y no se le pudo
         devolver el dinero a todos sus alumnos: o su cuenta de Stripe no tenía
         saldo, o el cargo es anterior a que se guardara la referencia de pago.
       </p>
       <p style="line-height:1.6">
         Quedan <strong>${pendientes.length}</strong>
         ${pendientes.length === 1 ? "movimiento" : "movimientos"} por resolver,
         <strong>$${pesos(total)} MXN</strong> en total. El archivo adjunto trae
         un renglón por cada uno, con el correo del alumno, para cobrarlo a mano.
       </p>`,
    ),
    attachments: [
      {
        filename: `reembolsos-pendientes-${studioName.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}.xlsx`,
        content: Buffer.from(buffer),
      },
    ],
  });
}

module.exports = {
  sendClosureCredit,
  sendClosureRefund,
  sendNoFundsReport,
  buildPendingWorkbook,
};
