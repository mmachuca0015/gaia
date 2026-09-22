// Las sucursales de un dueño. Cada una es una fila de `studios`; lo que las
// agrupa es `owner_id`.
const pool = require("../db");
const {
  STUDIO_COMPLETE,
  STUDIO_HOURS_JSON,
  STUDIO_WITHIN_PLAN,
  ownerBranchLimit,
} = require("./catalog");

// Las sucursales vivas de un dueño, en el orden en que las creo. `complete` y
// `within_plan` salen del MISMO SQL con el que el catalogo decide si se
// publica, para que el panel no pueda decir una cosa y el catalogo otra.
//
// El orden importa y es el mismo que usa STUDIO_WITHIN_PLAN: la primera de
// la lista es la que nacio con la cuenta, y es la que sobrevive si el dueño
// baja de Pro a Basic.
const BRANCHES_QUERY = `
  SELECT studios.*,
         ${STUDIO_HOURS_JSON}   AS hours,
         ${STUDIO_COMPLETE}     AS complete,
         ${STUDIO_WITHIN_PLAN}  AS within_plan
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
 * Es el mismo COALESCE que usa el catalogo para decidir cuales publica
 * (`ownerBranchLimit`), no una segunda copia: si se escribieran aparte, el
 * panel podria ofrecer un lugar que el catalogo no reconoce.
 */
async function branchLimit(ownerId, client = pool) {
  const { rows } = await client.query(
    `SELECT ${ownerBranchLimit("$1")} AS max_studios`,
    [ownerId],
  );
  return Number(rows[0]?.max_studios) || 1;
}

/** Las sucursales del dueño, ya con la lista de lo que le falta a cada una. */
async function listBranches(ownerId, client = pool) {
  const { rows } = await client.query(BRANCHES_QUERY, [ownerId]);
  return rows.map((studio) => ({ ...studio, missing: missingFields(studio) }));
}

/**
 * ¿Cabe esta sucursal en el plan de su dueño? Una que no cabe esta dormida:
 * el dueño la ve en el panel pero no la puede administrar, y el catalogo no
 * la publica. Se comprueba en la base con el mismo fragmento que el catalogo.
 */
async function branchWithinPlan(studioId, client = pool) {
  const { rows } = await client.query(
    `SELECT ${STUDIO_WITHIN_PLAN} AS within_plan
       FROM studios WHERE studios.id = $1`,
    [studioId],
  );
  return rows[0]?.within_plan === true;
}

module.exports = {
  listBranches,
  branchLimit,
  branchWithinPlan,
  missingFields,
};
