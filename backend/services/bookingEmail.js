// Correo de "reserva confirmada". Lo mandan el cobro de una clase y el canje
// de un paquete; solo cambia la linea de pago.
const { Resend } = require("resend");
const pool = require("../db");

const resend = new Resend(process.env.RESEND_API_KEY);

const DIAS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

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

// "Jueves 1 de octubre de 2026" a partir de un "YYYY-MM-DD". Se arma aqui y no
// con to_char, que para los nombres depende del locale del servidor: el de
// Render esta en ingles y saldria "Thursday".
function fechaLarga(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dia = DIAS[new Date(y, m - 1, d).getDay()];
  return `${dia} ${d} de ${MESES[m - 1]} de ${y}`;
}

// Nunca truena: un correo que no sale no debe tumbar una reserva ya cobrada.
async function sendBookingConfirmation(bookingId, paymentLine) {
  try {
    // Se arma con la reserva recien creada, no con "la ultima del usuario",
    // que en concurrencia podia ser otra.
    const { rows } = await pool.query(
      `
  SELECT
    users.name,
    users.email,
    classes.name AS class_name,
    COALESCE(instructors.name || ' ' || instructors.last_name, classes.instructor) AS instructor,
    -- La fecha de la clase reservada, que es la que le importa al alumno:
    -- una permanente se da muchas veces y el correo tiene que decir cual.
    to_char(bookings.class_date, 'YYYY-MM-DD') AS class_date,
    -- Solo por si una reserva vieja no tiene class_date. Una clase unica no
    -- tiene dia de la semana, tiene fecha: de ahi sale el dia.
    CASE COALESCE(schedules.day, EXTRACT(DOW FROM schedules.date)::int)
      WHEN 0 THEN 'Domingo'
      WHEN 1 THEN 'Lunes'
      WHEN 2 THEN 'Martes'
      WHEN 3 THEN 'Miércoles'
      WHEN 4 THEN 'Jueves'
      WHEN 5 THEN 'Viernes'
      WHEN 6 THEN 'Sábado'
    END AS day,
    schedules.time,
    studios.name AS studio_name,
    classes.price
  FROM bookings
  JOIN users ON users.id = bookings.user_id
  JOIN schedules ON bookings.schedule_id = schedules.id
  JOIN classes ON schedules.class_id = classes.id
  JOIN studios ON classes.studio_id = studios.id
  LEFT JOIN instructors ON classes.instructor_id = instructors.id
  WHERE bookings.id = $1
`,
      [bookingId],
    );
    const booking = rows[0];

    await resend.emails.send({
      from: "Wellco <onboarding@resend.dev>",
      to: booking.email,
      subject: "¡Reserva confirmada!",
      html: `
    <h2>¡Hola ${booking.name}!</h2>
    <p>Tu reserva ha sido confirmada.</p>
    <p><strong>Clase:</strong> ${booking.class_name}</p>
    <p><strong>Instructor:</strong> ${booking.instructor}</p>
    <p><strong>Estudio:</strong> ${booking.studio_name}</p>
    <p><strong>Día:</strong> ${
      booking.class_date ? fechaLarga(booking.class_date) : booking.day
    }</p>
    <p><strong>Hora:</strong> ${booking.time.slice(0, 5)}</p>
    <p><strong>Pago:</strong> ${paymentLine}</p>
    <br>
    <p>¡Nos vemos en clase!</p>
    <p>El equipo de Wellco</p>
  `,
    });
  } catch (error) {
    console.error("Error enviando email:", error);
  }
}

module.exports = { sendBookingConfirmation };
