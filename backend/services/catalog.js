// Que estudios estan publicados para los clientes.
const pool = require("../db");

// Un estudio real se publica mientras su suscripcion este al corriente:
//   - 'activa': si. Incluye la que el dueño cancelo, porque sigue activa hasta
//     que termina el periodo que ya pago.
//   - 'pendiente' o 'vencida': solo hasta `paid_until`, el ultimo dia cubierto
//     por un cobro exitoso. Si el dueño no resuelve el pago, ahi desaparece.
//     Quien nunca ha pagado no tiene ese dia y no se publica.
//   - 'cancelada': no.
// Los dueños sin fila en `subscriptions` (heredados) siguen visibles.
//
// Si no se publica, no sale en el catalogo y no acepta reservas.
//
// Es un fragmento de WHERE que espera la tabla `studios` en la consulta.
const STUDIO_PUBLISHED = `NOT EXISTS (
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
  return `(CASE WHEN studios.is_demo THEN ${param}::boolean
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

module.exports = { STUDIO_PUBLISHED, studioVisibleTo, viewerIsDemo };
