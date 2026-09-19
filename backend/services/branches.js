// Las sucursales de un dueño. Cada una es una fila de `studios`; lo que las
// agrupa es `owner_id`.
const pool = require("../db");
const { STUDIO_COMPLETE, STUDIO_HOURS_JSON } = require("./catalog");

// Las sucursales vivas de un dueño, en el orden en que las creo. `complete`
// sale del MISMO SQL con el que el catalogo decide si se publica, para que el
// panel no pueda decir una cosa y el catalogo otra.
const BRANCHES_QUERY = `
  SELECT studios.*,
         ${STUDIO_HOURS_JSON} AS hours,
         ${STUDIO_COMPLETE}   AS complete
  FROM studios
  WHERE studios.owner_id = $1 AND studios.deleted_at IS NULL
  ORDER BY studios.created_at, studios.id`;

const vacio = (v) => !v || !String(v).trim();

// Que le falta a una sucursal para publicarse, en palabras. El que manda es
// `complete`; esta lista solo le dice al dueño que capturar.
function missingFields(studio) {
  const falta = [];
  if (vacio(studio.name)) falta.push("Nombre");
  if (vacio(studio.description)) falta.push("Descripción");
  if (
    vacio(studio.street) ||
    vacio(studio.ext_number) ||
    vacio(studio.neighborhood) ||
    vacio(studio.zip_code) ||
    vacio(studio.city) ||
    vacio(studio.state) ||
    vacio(studio.country)
  ) {
    falta.push("Dirección");
  }
  if (studio.latitude == null || studio.longitude == null) {
    falta.push("Ubicación en el mapa");
  }
  if (vacio(studio.phone)) falta.push("Teléfono");
  if (!studio.hours || studio.hours.length === 0) falta.push("Horario");
  if (vacio(studio.logo_url)) falta.push("Imagen de perfil");
  if (vacio(studio.cover_url)) falta.push("Imagen de portada");
  return falta;
}

/**
 * Cuantas sucursales puede tener este dueño: las que permite su plan.
 *
 * Sin fila en `subscriptions` es un dueño heredado (se registro antes de que
 * existieran los planes) y a esos no se les bloquea nada, asi que se le da el
 * limite mas alto que haya. Un plan sin limite capturado vale por una.
 */
async function branchLimit(ownerId, client = pool) {
  const { rows } = await client.query(
    `SELECT COALESCE(
       (SELECT p.max_studios FROM subscriptions s
          JOIN plans p ON p.id = s.plan_id
         WHERE s.owner_id = $1),
       (SELECT MAX(max_studios) FROM plans WHERE is_active),
       1
     ) AS max_studios`,
    [ownerId],
  );
  return Number(rows[0]?.max_studios) || 1;
}

/** Las sucursales del dueño, ya con la lista de lo que le falta a cada una. */
async function listBranches(ownerId, client = pool) {
  const { rows } = await client.query(BRANCHES_QUERY, [ownerId]);
  return rows.map((studio) => ({ ...studio, missing: missingFields(studio) }));
}

module.exports = { listBranches, branchLimit, missingFields };
