// Horario de atencion de los estudios (tabla studio_hours): validacion y
// escritura. El calculo de "abierto ahora" vive en services/catalog.js.

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// Recibe [{ day, opens: "HH:MM", closes: "HH:MM" }, ...], solo los dias que
// abre. Devuelve { error } o { hours }.
function parseHours(input) {
  if (!Array.isArray(input) || input.length === 0) {
    return { error: "Elige al menos un día en que abre tu estudio" };
  }
  const seen = new Set();
  const hours = [];
  for (const row of input) {
    const day = Number(row?.day);
    const opens = String(row?.opens || "");
    const closes = String(row?.closes || "");
    if (!Number.isInteger(day) || day < 0 || day > 6 || seen.has(day)) {
      return { error: "Horario inválido" };
    }
    if (!TIME.test(opens) || !TIME.test(closes)) {
      return { error: "Escribe la hora de apertura y de cierre" };
    }
    // "HH:MM" se compara bien como texto.
    if (closes <= opens) {
      return { error: "La hora de cierre debe ser después de la de apertura" };
    }
    seen.add(day);
    hours.push({ day, opens, closes });
  }
  return { hours };
}

// Reemplaza el horario completo del estudio. Va dentro de la transaccion de
// quien llama.
async function replaceHours(db, studioId, hours) {
  await db.query("DELETE FROM studio_hours WHERE studio_id = $1", [studioId]);
  for (const h of hours) {
    await db.query(
      "INSERT INTO studio_hours (studio_id, day, opens, closes) VALUES ($1, $2, $3, $4)",
      [studioId, h.day, h.opens, h.closes],
    );
  }
}

module.exports = { parseHours, replaceHours };
