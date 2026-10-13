// Borrar una cuenta de verdad, con todo lo que cuelga de ella. Lo usa el admin
// desde /admin/usuarios para limpiar cuentas de prueba.
//
// Es un DELETE fisico, no un `deleted_at`: la idea es que no quede rastro. Por
// eso tambien se lleva el dinero registrado (reservas, compras, cobros de
// suscripcion), y las metricas del admin y del estudio bajan. Para una cuenta
// real que solo quiere irse, esto NO es lo indicado.
//
// Varias llaves foraneas no tienen ON DELETE CASCADE (bookings -> users,
// bookings -> package_purchases, studios -> studio_owners, ...), asi que el
// orden de abajo importa: primero lo que apunta, luego a lo que se apunta.
//
// Stripe va DESPUES del COMMIT. Borrar el customer cancela su suscripcion al
// momento, y el webhook `customer.subscription.deleted` correria
// `refundStudents` (reembolsos reales) si todavia encontrara la fila en
// `subscriptions`. Con la base ya limpia, el webhook no encuentra nada.
const pool = require("../db");
const { stripe, resourceMissing } = require("./stripe");

const ROLES = ["user", "owner"];

// Lo que se va a borrar, para enseñarlo en el pop up antes de confirmar.
async function deletionImpact(role, id, db = pool) {
  if (role === "user") {
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.last_name, u.email, u.is_demo,
              (SELECT COUNT(*) FROM bookings WHERE user_id = u.id)::int AS bookings,
              (SELECT COUNT(*) FROM package_purchases WHERE user_id = u.id)::int AS purchases,
              (SELECT COUNT(*) FROM favorites WHERE user_id = u.id)::int AS favorites
         FROM users u WHERE u.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  const { rows } = await db.query(
    `WITH st AS (SELECT id FROM studios WHERE owner_id = $1)
     SELECT o.id, o.name, o.last_name, o.email,
            EXISTS (SELECT 1 FROM studios WHERE owner_id = o.id AND is_demo) AS is_demo,
            (SELECT COUNT(*) FROM st)::int AS studios,
            (SELECT COUNT(*) FROM classes WHERE studio_id IN (SELECT id FROM st))::int AS classes,
            (SELECT COUNT(*) FROM bookings b
               JOIN schedules s ON s.id = b.schedule_id
               JOIN classes c ON c.id = s.class_id
              WHERE c.studio_id IN (SELECT id FROM st))::int AS bookings,
            (SELECT COUNT(*) FROM package_purchases
              WHERE studio_id IN (SELECT id FROM st))::int AS purchases,
            sub.status AS subscription_status
       FROM studio_owners o
       LEFT JOIN subscriptions sub ON sub.owner_id = o.id
      WHERE o.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

async function deleteUser(client, id) {
  const { rows } = await client.query(
    "SELECT email, stripe_customer_id FROM users WHERE id = $1 FOR UPDATE",
    [id],
  );
  if (!rows[0]) return null;
  const { email, stripe_customer_id } = rows[0];

  // Las reservas primero: apuntan a sus compras de paquete sin cascada.
  await client.query("DELETE FROM bookings WHERE user_id = $1", [id]);
  await client.query("DELETE FROM package_purchases WHERE user_id = $1", [id]);
  await client.query("DELETE FROM favorites WHERE user_id = $1", [id]);
  await client.query("DELETE FROM refunds WHERE user_id = $1", [id]);
  // Los ids se repiten entre tablas: la sesion se fija por rol + id.
  await client.query(
    "DELETE FROM sessions WHERE user_id = $1 AND role = 'user'",
    [id],
  );
  await client.query("DELETE FROM password_resets WHERE email = $1", [email]);
  await client.query("DELETE FROM users WHERE id = $1", [id]);

  return { email, stripeCustomerId: stripe_customer_id };
}

async function deleteOwner(client, id) {
  const { rows } = await client.query(
    `SELECT o.email, sub.stripe_customer_id, sub.stripe_subscription_id
       FROM studio_owners o
       LEFT JOIN subscriptions sub ON sub.owner_id = o.id
      WHERE o.id = $1
      FOR UPDATE OF o`,
    [id],
  );
  if (!rows[0]) return null;
  const { email, stripe_customer_id, stripe_subscription_id } = rows[0];

  // Todas sus sucursales, tambien las borradas con `deleted_at`: siguen en la
  // tabla y la llave de studios -> studio_owners no dejaria borrar al dueño.
  const studios = (
    await client.query("SELECT id FROM studios WHERE owner_id = $1", [id])
  ).rows.map((r) => r.id);

  if (studios.length) {
    const purchases = `SELECT id FROM package_purchases
                        WHERE studio_id = ANY($1) OR origin_studio_id = ANY($1)`;
    const schedules = `SELECT s.id FROM schedules s
                         JOIN classes c ON c.id = s.class_id
                        WHERE c.studio_id = ANY($1)`;

    // Las reservas de los alumnos en sus clases, y las que salieron de sus
    // paquetes (por si alguna quedo en otra parte).
    await client.query(
      `DELETE FROM bookings
        WHERE schedule_id IN (${schedules})
           OR package_purchase_id IN (${purchases})`,
      [studios],
    );
    await client.query(
      "DELETE FROM package_purchases WHERE studio_id = ANY($1) OR origin_studio_id = ANY($1)",
      [studios],
    );
    // Los reembolsos sueltos quedarian con studio_id NULL: tambien se van.
    await client.query("DELETE FROM refunds WHERE studio_id = ANY($1)", [studios]);
    await client.query("DELETE FROM favorites WHERE studio_id = ANY($1)", [studios]);
    await client.query(`DELETE FROM schedules WHERE id IN (${schedules})`, [studios]);
    await client.query("DELETE FROM classes WHERE studio_id = ANY($1)", [studios]);
    await client.query("DELETE FROM instructors WHERE studio_id = ANY($1)", [studios]);
    // packages, studio_hours y studio_notices caen en cascada.
    await client.query("DELETE FROM studios WHERE id = ANY($1)", [studios]);
  }

  if (stripe_subscription_id) {
    await client.query(
      "DELETE FROM subscription_payments WHERE stripe_subscription_id = $1",
      [stripe_subscription_id],
    );
  }
  // subscriptions, plan_downgrade_reasons y admin_plan_changes caen en
  // cascada; coupons.redeemed_by queda en NULL.
  await client.query(
    "DELETE FROM sessions WHERE user_id = $1 AND role = 'owner'",
    [id],
  );
  await client.query("DELETE FROM password_resets WHERE email = $1", [email]);
  await client.query("DELETE FROM studio_owners WHERE id = $1", [id]);

  return { email, stripeCustomerId: stripe_customer_id };
}

/**
 * Borra la cuenta y todo lo suyo. Devuelve null si no existe, o
 * `{ email, stripe }` donde `stripe` dice que paso con su customer de Stripe.
 */
async function deleteAccount(role, id) {
  const client = await pool.connect();
  let deleted;
  try {
    await client.query("BEGIN");
    deleted = role === "user" ? await deleteUser(client, id) : await deleteOwner(client, id);
    if (!deleted) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // Borrar el customer se lleva sus tarjetas guardadas y cancela al momento
  // la suscripcion del dueño, para que Stripe no le siga cobrando a nadie.
  // Si falla, la cuenta ya no existe en la base: se avisa, no se revierte.
  let stripeResult = "sin_cliente";
  if (deleted.stripeCustomerId) {
    try {
      await stripe.customers.del(deleted.stripeCustomerId);
      stripeResult = "borrado";
    } catch (err) {
      if (resourceMissing(err)) {
        stripeResult = "no_existia";
      } else {
        console.error(
          "Cuenta borrada pero no su customer de Stripe",
          deleted.stripeCustomerId,
          err.message,
        );
        stripeResult = "fallo";
      }
    }
  }

  return { email: deleted.email, stripe: stripeResult, stripeCustomerId: deleted.stripeCustomerId };
}

module.exports = { ROLES, deletionImpact, deleteAccount };
