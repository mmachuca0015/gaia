// Lugares de una clase en una FECHA concreta.
//
// Un horario permanente se repite cada semana, asi que los lugares no pueden
// ser un contador en el horario: schedules.available_spots bajaba con cada
// reserva y nunca subia, y una clase de 10 quedaba "llena" para siempre
// despues de 10 reservas sumando todas las semanas. Ahora lo ocupado se
// cuenta con las reservas de esa fecha, y available_spots ya no se usa.

const TODAY_MX = `(NOW() AT TIME ZONE 'America/Mexico_City')::date`;

// ¿El horario `s` se da en la fecha `dateExpr`? Las permanentes, en su dia
// de la semana; las unicas, solo en su fecha.
function scheduleOnDate(dateExpr, s = "schedules") {
  return `(
    (${s}.is_permanent AND ${s}.day = EXTRACT(DOW FROM ${dateExpr}::date))
    OR (NOT ${s}.is_permanent AND ${s}.date = ${dateExpr}::date)
  )`;
}

// Reservas que ocupan lugar en el horario `s` en la fecha `dateExpr`.
function bookedOnDate(dateExpr, s = "schedules") {
  return `(
    SELECT COUNT(*)::int FROM bookings b
    WHERE b.schedule_id = ${s}.id
      AND b.class_date = ${dateExpr}::date
      AND b.status IN ('activa', 'pasada')
  )`;
}

// Aparta un lugar para reservar: bloquea el horario (dos reservas al mismo
// tiempo no pueden llevarse el ultimo lugar) y comprueba que la clase se da
// ese dia, que no es una fecha pasada y que queda lugar. Va dentro de la
// transaccion de quien llama. Devuelve { error } o { ok: true }.
async function lockSpot(client, scheduleId, classDate) {
  // Primero el bloqueo, solo. El conteo va en una consulta aparte: en READ
  // COMMITTED cada consulta toma su propia foto, y la de despues del
  // bloqueo ya incluye la reserva de quien lo tenia antes. Contando en la
  // misma consulta, dos reservas simultaneas podian ver el mismo ultimo
  // lugar libre.
  const locked = await client.query(
    "SELECT id FROM schedules WHERE id = $1 FOR UPDATE",
    [scheduleId],
  );
  if (locked.rows.length === 0) return { error: "Clase no encontrada" };

  const { rows } = await client.query(
    `SELECT classes.capacity,
            ${scheduleOnDate("$2")} AS happens,
            $2::date < ${TODAY_MX} AS past,
            ${bookedOnDate("$2")} AS booked
     FROM schedules
     JOIN classes ON classes.id = schedules.class_id
     WHERE schedules.id = $1`,
    [scheduleId, classDate],
  );
  const s = rows[0];
  if (!s.happens) return { error: "Esta clase no se da ese día" };
  if (s.past) return { error: "Esta clase ya pasó" };
  if (s.booked >= s.capacity) return { error: "Ya no hay lugares disponibles" };
  return { ok: true };
}

module.exports = { scheduleOnDate, bookedOnDate, lockSpot };
