// A quien le pega un cambio de plan o una cancelacion, ANTES de confirmarlo.
//
// Lo que el dueño necesita ver no es "vas a perder sucursales", es "Sur tiene
// 12 reservaciones". El numero es lo que lo hace pensar, y tiene que salir de
// la base, no de una estimacion del navegador.
const pool = require("../db");
const { TODAY_MX } = require("./packages");
const { studioWithinPlan } = require("./catalog");

// Reservaciones vivas de una sucursal que todavia no pasan. Las pasadas no
// estorban: ya se dieron.
//
// `soloPagadas` deja fuera las que salieron de un paquete. Esas no se abonan:
// si la sucursal cierra se le regresa la clase al paquete, que de todos modos
// se canjea en la que sobrevive. Las pagadas con tarjeta si se convierten en
// clases gratis, y de esas es de las que hay que avisarle al dueño.
const futureBookings = (soloPagadas = false) => `(
  SELECT COUNT(*)::int FROM bookings b
    JOIN schedules sch ON sch.id = b.schedule_id
    JOIN classes   cl  ON cl.id  = sch.class_id
   WHERE cl.studio_id = studios.id
     AND b.status = 'activa'
     AND b.class_date >= ${TODAY_MX}
     ${soloPagadas ? "AND b.package_purchase_id IS NULL" : ""}
)`;

// Clases compradas en paquete que nadie ha canjeado y todavia sirven. Es la
// deuda mas facil de olvidar: se cobro hace meses y no aparece en ninguna
// agenda.
const UNUSED_PACKAGE_CLASSES = `(
  SELECT COALESCE(SUM(pp.classes_total - pp.classes_used), 0)::int
    FROM package_purchases pp
   WHERE pp.studio_id = studios.id
     AND pp.classes_used < pp.classes_total
     AND (pp.expires_at AT TIME ZONE 'America/Mexico_City')::date >= ${TODAY_MX}
)`;

/**
 * Las sucursales del dueño con lo que cuelga de cada una, de la mas vieja a la
 * mas nueva: el mismo orden con el que el catalogo decide cuales caben.
 *
 * `sleeps` dice si esa sucursal se dormiria con un plan de `maxStudios`
 * sucursales. Con `maxStudios = 0` se duermen todas, que es lo que pasa al
 * cancelar.
 */
async function branchImpact(ownerId, maxStudios, db = pool) {
  const { rows } = await db.query(
    `SELECT studios.id, studios.name, studios.branch_name,
            ${futureBookings()}       AS bookings,
            ${futureBookings(true)}   AS credit_classes,
            ${UNUSED_PACKAGE_CLASSES} AS package_classes,
            ${studioWithinPlan()}     AS within_plan
       FROM studios
      WHERE studios.owner_id = $1 AND studios.deleted_at IS NULL
      ORDER BY studios.created_at, studios.id`,
    [ownerId],
  );
  return rows.map((branch, i) => ({ ...branch, sleeps: i >= maxStudios }));
}

/** Solo las que se dormirian, que es lo unico que se le enseña al dueño. */
async function sleepingImpact(ownerId, maxStudios, db = pool) {
  return (await branchImpact(ownerId, maxStudios, db)).filter((b) => b.sleeps);
}

module.exports = { branchImpact, sleepingImpact };
