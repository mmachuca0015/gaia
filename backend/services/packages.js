// Reglas de los paquetes de clases, en un solo lugar: cuando se vende uno,
// cuanto dura despues de comprarlo y en que horarios se puede canjear.
const pool = require("../db");

// "Hoy" en Mexico. La base de Render corre en UTC: sin esto, un paquete que
// termina el dia 30 dejaria de venderse a las 6 de la tarde del 30.
const TODAY_MX = `(NOW() AT TIME ZONE 'America/Mexico_City')::date`;

// Estado de venta de un paquete `p` que no esta borrado.
const PACKAGE_STATUS = `
  CASE
    WHEN NOT p.is_active                  THEN 'desactivado'
    WHEN p.sale_ends_on   < ${TODAY_MX}   THEN 'terminado'
    WHEN p.sale_starts_on > ${TODAY_MX}   THEN 'programado'
    ELSE 'a_la_venta'
  END`;

// Filtro de "se puede comprar hoy".
const PACKAGE_ON_SALE = `
  p.deleted_at IS NULL
  AND p.is_active
  AND (p.sale_starts_on IS NULL OR p.sale_starts_on <= ${TODAY_MX})
  AND (p.sale_ends_on   IS NULL OR p.sale_ends_on   >= ${TODAY_MX})`;

// Duraciones que ofrece el formulario: 1 semana, 15 dias, 1 a 12 meses.
const VALIDITY_OPTIONS = [
  { value: 7, unit: "day" },
  { value: 15, unit: "day" },
  ...Array.from({ length: 12 }, (_, i) => ({ value: i + 1, unit: "month" })),
];

function isValidValidity(value, unit) {
  return VALIDITY_OPTIONS.some((o) => o.value === value && o.unit === unit);
}

// Intervalo de Postgres para la vigencia, calculado en SQL al comprar.
// Los parametros se validan con isValidValidity antes de llegar aqui.
function validityInterval(value, unit) {
  return unit === "month"
    ? `make_interval(months => ${Number(value)})`
    : `make_interval(days => ${Number(value)})`;
}

// Precio que se cobra: el de descuento si lo hay.
function packageChargeCents(pkg) {
  return pkg.sale_price_cents ?? pkg.price_cents;
}

// Compras del alumno con las que puede reservar un horario en una fecha.
//
// La regla usa la COPIA de la compra, no el paquete: si el dueño lo edito o lo
// borro, lo que el alumno compro vale tal como se le confirmo. Una compra
// cubre el horario si:
//   - es del mismo alumno y le quedan clases;
//   - la clase se da antes de que venza;
//   - la clase es del MISMO estudio donde se compro el paquete;
//   - el paquete es de cualquier clase, o esa clase esta en la lista;
//   - el paquete acepta clases unicas, o el horario es permanente.
async function usablePurchases(userId, scheduleId, classDate, db = pool) {
  const { rows } = await db.query(
    `SELECT pp.id, pp.name, pp.classes_total - pp.classes_used AS remaining,
            pp.expires_at
     FROM package_purchases pp
     JOIN schedules s ON s.id = $2
     JOIN classes c   ON c.id = s.class_id AND c.studio_id = pp.studio_id
     WHERE pp.user_id = $1
       AND pp.classes_used < pp.classes_total
       AND $3::date <= (pp.expires_at AT TIME ZONE 'America/Mexico_City')::date
       AND (pp.any_class OR EXISTS (
             SELECT 1 FROM package_purchase_classes ppc
             WHERE ppc.purchase_id = pp.id AND ppc.class_id = c.id))
       AND (NOT pp.permanent_only OR s.is_permanent)
     ORDER BY pp.expires_at, pp.id`,
    [userId, scheduleId, classDate],
  );
  return rows;
}

module.exports = {
  TODAY_MX,
  PACKAGE_STATUS,
  PACKAGE_ON_SALE,
  VALIDITY_OPTIONS,
  isValidValidity,
  validityInterval,
  packageChargeCents,
  usablePurchases,
};
