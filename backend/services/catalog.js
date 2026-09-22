// Que estudios estan publicados para los clientes.
const pool = require("../db");

// Los campos que tiene que tener una sucursal para salir en el catalogo. El
// registro solo pide nombre, estado, telefono y horario, asi que un estudio
// recien creado esta incompleto a proposito: el panel le dice al dueño que le
// falta y no lo publica hasta que lo llene. `int_number` no cuenta, no todos
// los locales tienen.
//
// Es un fragmento de WHERE que espera la tabla `studios` en la consulta.
const STUDIO_COMPLETE = `(
  btrim(COALESCE(studios.name, '')) <> ''
  AND btrim(COALESCE(studios.description, '')) <> ''
  AND btrim(COALESCE(studios.street, '')) <> ''
  AND btrim(COALESCE(studios.ext_number, '')) <> ''
  AND btrim(COALESCE(studios.neighborhood, '')) <> ''
  AND btrim(COALESCE(studios.zip_code, '')) <> ''
  AND btrim(COALESCE(studios.city, '')) <> ''
  AND btrim(COALESCE(studios.state, '')) <> ''
  AND btrim(COALESCE(studios.country, '')) <> ''
  AND studios.latitude IS NOT NULL AND studios.longitude IS NOT NULL
  AND btrim(COALESCE(studios.phone, '')) <> ''
  AND btrim(COALESCE(studios.logo_url, '')) <> ''
  AND btrim(COALESCE(studios.cover_url, '')) <> ''
  AND EXISTS (SELECT 1 FROM studio_hours h WHERE h.studio_id = studios.id)
)`;

// Una sucursal borrada sale del catalogo, pero no de la base: las reservas y
// los ingresos cuelgan de ella.
const STUDIO_LIVE = `studios.deleted_at IS NULL`;

// Cuantas sucursales permite el plan de un dueño. `ownerRef` es el SQL que
// apunta a su id: la tabla en una consulta correlacionada ($1 en una suelta).
//
// Sin fila en `subscriptions` es un dueño heredado (se registro antes de que
// existieran los planes) y a esos no se les bloquea nada, asi que se les da el
// limite mas alto que haya. Un plan sin limite capturado vale por una.
const ownerBranchLimit = (ownerRef) => `COALESCE(
  (SELECT p.max_studios FROM subscriptions sub
     JOIN plans p ON p.id = sub.plan_id
    WHERE sub.owner_id = ${ownerRef}),
  (SELECT MAX(p.max_studios) FROM plans p WHERE p.is_active),
  1
)`;

// ¿El plan de este dueño incluye mandar avisos a sus alumnos? Mismo COALESCE
// que el limite de sucursales, y por las mismas razones: el permiso vive en la
// base (`plans.notices`, que edita el admin) y no en el codigo, y al dueño
// heredado no se le quita nada que ya tuviera.
const ownerNotices = (ownerRef) => `COALESCE(
  (SELECT p.notices FROM subscriptions sub
     JOIN plans p ON p.id = sub.plan_id
    WHERE sub.owner_id = ${ownerRef}),
  (SELECT BOOL_OR(p.notices) FROM plans p WHERE p.is_active),
  FALSE
)`;

// ¿Cabe esta sucursal en el plan de su dueño?
//
// No se apaga ninguna sucursal a mano ni se guarda un interruptor: se cuentan
// las que se crearon antes que ella y caben las primeras `max_studios`. Asi
// bajar de Pro a Basic deja viva la que nacio con la cuenta y duerme las
// otras, y volver a Pro las despierta solas, sin tocar la base. No hay estado
// que se pueda desincronizar del plan.
//
// Dormida no es borrada: sus clases, reservas, paquetes e ingresos siguen
// enteros, solo que el catalogo deja de publicarla.
//
// `alias` es como se llama la tabla `studios` en la consulta: casi siempre
// `studios`, pero los paquetes la necesitan sobre dos sucursales a la vez (la
// de la compra y la que sobrevive) y ahi cada una lleva su alias.
//
// Es un fragmento de WHERE.
const studioWithinPlan = (alias = "studios") => `(
  (SELECT COUNT(*) FROM studios older
    WHERE older.owner_id = ${alias}.owner_id
      AND older.deleted_at IS NULL
      AND (older.created_at, older.id) < (${alias}.created_at, ${alias}.id)
  ) < ${ownerBranchLimit(`${alias}.owner_id`)}
)`;

const STUDIO_WITHIN_PLAN = studioWithinPlan();

// Un estudio real se publica mientras su suscripcion este al corriente:
//   - 'activa': si. Incluye la que el dueño cancelo, porque sigue activa hasta
//     que termina el periodo que ya pago.
//   - 'pendiente' o 'vencida': solo hasta `paid_until`, el ultimo dia cubierto
//     por un cobro exitoso. Si el dueño no resuelve el pago, ahi desaparece.
//     Quien nunca ha pagado no tiene ese dia y no se publica.
//   - 'cancelada': no.
// Los dueños sin fila en `subscriptions` (heredados) siguen visibles.
//
// Ademas tiene que estar completo, no borrado y caber en el plan: un Basic
// con tres sucursales de cuando era Pro publica solo la primera.
//
// Si no se publica, no sale en el catalogo y no acepta reservas.
//
// Es un fragmento de WHERE que espera la tabla `studios` en la consulta.
const STUDIO_PUBLISHED = `${STUDIO_LIVE} AND ${STUDIO_WITHIN_PLAN} AND ${STUDIO_COMPLETE} AND NOT EXISTS (
  SELECT 1 FROM subscriptions sub
  WHERE sub.owner_id = studios.owner_id
    AND NOT (
      sub.status = 'activa'
      -- El COALESCE no sobra: con paid_until NULL la comparacion da NULL, el
      -- NOT de NULL tambien, y el estudio que nunca pago quedaba publicado.
      OR (sub.status IN ('pendiente', 'vencida')
          AND COALESCE(sub.paid_until > NOW(), FALSE))
    )
)`;

// ¿Puede el visitante ver este estudio? Los estudios demo los ven SOLO los
// usuarios demo, sin importar su suscripcion; nunca se publican para nadie
// mas. `param` es el placeholder ($n) con el resultado de viewerIsDemo.
function studioVisibleTo(param) {
  // El estudio demo se salta la suscripcion y lo de estar completo, que es
  // justo lo que se esta probando, pero borrado es borrado para todos, y el
  // limite de sucursales es del plan, no del pago: aplica igual.
  return `(${STUDIO_LIVE} AND ${STUDIO_WITHIN_PLAN}
           AND CASE WHEN studios.is_demo THEN ${param}::boolean
               ELSE ${STUDIO_PUBLISHED} END)`;
}

// El visitante es un usuario demo. Se consulta en la base en cada peticion:
// la marca la pone el admin y no viaja en la sesion.
async function viewerIsDemo(user) {
  if (user?.role !== "user") return false;
  const { rows } = await pool.query("SELECT is_demo FROM users WHERE id = $1", [
    user.id,
  ]);
  return rows[0]?.is_demo === true;
}

// "Desde $X / clase" del catalogo: la clase mas barata que el estudio tiene
// con horario, calculada cada vez. La columna studios.price_from era un
// numero fijo que nadie actualizaba, y mostraba precios que ya no existian.
// Null si el estudio aun no tiene clases.
const STUDIO_PRICE_FROM = `(
  SELECT MIN(c.price) FROM classes c
  WHERE c.studio_id = studios.id
    AND EXISTS (SELECT 1 FROM schedules s WHERE s.class_id = c.id)
)`;

// Hora actual en Mexico. La base de Render corre en UTC.
const NOW_MX = `(NOW() AT TIME ZONE 'America/Mexico_City')`;

// ¿Esta abierto el estudio en este momento? Con horario capturado
// (studio_hours) se calcula con el dia y la hora de Mexico. Los estudios
// registrados antes del horario no tienen filas y siguen usando el
// interruptor viejo studios.is_open.
const STUDIO_OPEN_NOW = `(
  CASE WHEN EXISTS (SELECT 1 FROM studio_hours h WHERE h.studio_id = studios.id)
    THEN EXISTS (
      SELECT 1 FROM studio_hours h
      WHERE h.studio_id = studios.id
        AND h.day = EXTRACT(DOW FROM ${NOW_MX})
        AND ${NOW_MX}::time >= h.opens
        AND ${NOW_MX}::time <  h.closes)
    ELSE COALESCE(studios.is_open, FALSE)
  END
)`;

// Horario del estudio como [{ day, opens: "HH:MM", closes: "HH:MM" }].
const STUDIO_HOURS_JSON = `COALESCE(
  (SELECT json_agg(json_build_object(
            'day', h.day,
            'opens', to_char(h.opens, 'HH24:MI'),
            'closes', to_char(h.closes, 'HH24:MI'))
          ORDER BY h.day)
   FROM studio_hours h WHERE h.studio_id = studios.id),
  '[]'::json
)`;

module.exports = {
  STUDIO_PUBLISHED,
  STUDIO_COMPLETE,
  STUDIO_LIVE,
  STUDIO_WITHIN_PLAN,
  studioWithinPlan,
  ownerBranchLimit,
  ownerNotices,
  STUDIO_PRICE_FROM,
  STUDIO_OPEN_NOW,
  STUDIO_HOURS_JSON,
  studioVisibleTo,
  viewerIsDemo,
};
