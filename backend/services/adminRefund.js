// Reembolso de una clase suelta pedido por soporte (/admin/clases-pagadas).
//
// Es para cuando hubo un problema con el estudio, asi que:
//   - Al alumno se le devuelve el PRECIO de la clase, no el 3% de servicio
//     (misma regla que el cierre de un estudio, services/closure.js).
//   - Al estudio se le recupera TODO lo que recibio por esa reserva, no la
//     parte proporcional que revierte Stripe por si solo. El problema fue suyo.
//   - Lo que no se puede recuperar es la comision de Stripe del cobro
//     original: Stripe no la devuelve y de la cuenta del estudio solo sale lo
//     que se le transfirio. La absorbe Wellco y queda en
//     `refunds.stripe_fee_cents`, como en el cierre.
//
// Orden, y por que:
//   1. Se aparta el renglon de `refunds` ('en_proceso') en una transaccion con
//      la reserva bloqueada. El UNIQUE por reserva hace que un doble clic o
//      dos admins a la vez no devuelvan dos veces.
//   2. Stripe: el reembolso con `reverse_transfer` (atomico: si la cuenta del
//      estudio no puede, no se devuelve nada) y despues la reversion del resto
//      de la transferencia. Las dos con llave de idempotencia por reserva: si
//      el servidor se cae a la mitad, el reintento no cobra ni devuelve doble.
//   3. La reserva pasa a 'reembolsada' (libera el lugar y sale de los
//      ingresos) y el renglon a 'hecho'.
//   4. Correos al alumno y al estudio. Un correo que no sale no deshace nada.
const pool = require("../db");
const { stripe } = require("./stripe");
const { stripeFeeOf } = require("./closure");
const { sendRefundToStudent, sendRefundToStudio } = require("./refundEmail");

const REASON_MAX = 500;

class RefundError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** La reserva con todo lo que se necesita para devolverla y avisar. */
async function loadBooking(client, bookingId) {
  const { rows } = await client.query(
    `SELECT b.id, b.status, b.user_id, b.package_purchase_id,
            b.stripe_payment_intent_id, b.price_cents, b.service_fee_cents,
            to_char(COALESCE(b.class_date, s.date), 'YYYY-MM-DD') AS class_date,
            to_char(s.time, 'HH24:MI') AS time,
            c.name AS class_name,
            st.id AS studio_id, st.name AS studio_name, st.is_demo,
            u.name AS user_name, u.last_name AS user_last_name,
            u.email AS user_email,
            o.name AS owner_name, o.email AS owner_email
       FROM bookings b
       JOIN schedules s  ON s.id = b.schedule_id
       JOIN classes c    ON c.id = s.class_id
       JOIN studios st   ON st.id = c.studio_id
       JOIN users u      ON u.id = b.user_id
       JOIN studio_owners o ON o.id = st.owner_id
      WHERE b.id = $1
      FOR UPDATE OF b`,
    [bookingId],
  );
  return rows[0] ?? null;
}

/** Por que no se puede devolver, o null si si se puede. */
function blockedReason(b) {
  if (b.is_demo) return "Es una reserva de un estudio demo: no hubo cobro real.";
  if (b.package_purchase_id) {
    return "Se reservó con un paquete: el cobro fue al comprar el paquete.";
  }
  if (!b.stripe_payment_intent_id || b.price_cents == null) {
    return "Es una reserva anterior a que se guardara el cobro; hay que devolverla desde Stripe.";
  }
  if (b.status === "reembolsada") return "Esta clase ya se reembolsó.";
  if (b.status !== "activa" && b.status !== "pasada") {
    return "Esta reserva ya no está activa.";
  }
  return null;
}

/** Aparta el renglon. Devuelve false si ya habia uno terminado. */
async function reserveRefundRow(client, b, adminId, reason) {
  const inserted = await client.query(
    `INSERT INTO refunds (kind, booking_id, user_id, studio_id, amount_cents,
                          status, admin_id, reason)
     VALUES ('reserva', $1, $2, $3, $4, 'en_proceso', $5, $6)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [b.id, b.user_id, b.studio_id, b.price_cents, adminId, reason],
  );
  if (inserted.rows[0]) return true;

  // Ya habia renglon: solo se sigue si se quedo a medias (el servidor se cayo
  // entre Stripe y la base). Las llaves de idempotencia hacen seguro repetir.
  const { rows } = await client.query(
    `SELECT status FROM refunds WHERE booking_id = $1`,
    [b.id],
  );
  return rows[0]?.status === "en_proceso";
}

/** Habla con Stripe. Devuelve el reembolso, lo recuperado y la tarjeta. */
async function refundInStripe(b) {
  const pi = await stripe.paymentIntents.retrieve(b.stripe_payment_intent_id, {
    expand: ["latest_charge"],
  });
  const charge = pi.latest_charge && typeof pi.latest_charge === "object"
    ? pi.latest_charge
    : null;
  const transferId = typeof charge?.transfer === "string"
    ? charge.transfer
    : charge?.transfer?.id ?? null;
  const card = charge?.payment_method_details?.card ?? null;

  const refund = await stripe.refunds.create(
    {
      payment_intent: pi.id,
      amount: b.price_cents,
      // Stripe revierte al estudio la parte proporcional en la misma
      // operacion: si su cuenta no puede, falla todo y no se devuelve nada.
      reverse_transfer: Boolean(transferId),
      metadata: { motivo: "soporte", booking_id: String(b.id) },
    },
    { idempotencyKey: `admin-refund-booking-${b.id}` },
  );

  // El resto de lo que el estudio recibio. Sin esto se quedaria con unos
  // pesos de una clase que no dio y Wellco pondria la diferencia.
  let recovered = 0;
  let reversalError = null;
  if (transferId) {
    const transfer = await stripe.transfers.retrieve(transferId);
    const remaining = transfer.amount - transfer.amount_reversed;
    if (remaining > 0) {
      try {
        await stripe.transfers.createReversal(
          transferId,
          {
            amount: remaining,
            metadata: { motivo: "soporte", booking_id: String(b.id) },
          },
          { idempotencyKey: `admin-reversal-booking-${b.id}` },
        );
      } catch (err) {
        // El alumno ya tiene su dinero; esto es lo que Wellco no pudo cobrarle
        // al estudio. Se anota y se avisa, no se deshace el reembolso.
        reversalError = err.message;
        console.error("No se recupero el resto de la transferencia", transferId, err);
      }
    }
    const after = await stripe.transfers.retrieve(transferId);
    recovered = after.amount_reversed;
  }

  return { refund, recovered, reversalError, card };
}

/**
 * @returns {{ refunded_cents, recovered_cents, warning }}
 * @throws RefundError con status HTTP y mensaje para la pantalla
 */
async function refundBookingByAdmin({ bookingId, adminId, reason }) {
  const motivo = typeof reason === "string" ? reason.trim().slice(0, REASON_MAX) : "";

  // 1. Apartar.
  const client = await pool.connect();
  let b;
  try {
    await client.query("BEGIN");
    b = await loadBooking(client, bookingId);
    if (!b) throw new RefundError(404, "No encontramos esa reserva");
    const blocked = blockedReason(b);
    if (blocked) throw new RefundError(409, blocked, "no_reembolsable");
    const ok = await reserveRefundRow(client, b, adminId, motivo || null);
    if (!ok) {
      throw new RefundError(409, "Esta clase ya se reembolsó.", "ya_reembolsada");
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // 2. Stripe.
  let result;
  try {
    result = await refundInStripe(b);
  } catch (err) {
    // No se devolvio nada: se suelta el renglon para poder reintentar.
    await pool
      .query(`DELETE FROM refunds WHERE booking_id = $1 AND status = 'en_proceso'`, [b.id])
      .catch((e) => console.error("No se solto el renglon de refunds", b.id, e));
    console.error("Reembolso de soporte fallido", b.id, err);
    const sinFondos = /insufficient|balance|funds/i.test(err.message ?? "");
    throw new RefundError(
      sinFondos ? 409 : 502,
      sinFondos
        ? "La cuenta de Stripe del estudio no tiene saldo para cubrir el reembolso. No se devolvió nada."
        : `Stripe rechazó el reembolso: ${err.message}`,
      sinFondos ? "sin_fondos" : "stripe",
    );
  }

  // 3. Base.
  const stripeFee = stripeFeeOf(b.price_cents, b.service_fee_cents);
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query(
      `UPDATE bookings SET status = 'reembolsada'
        WHERE id = $1 AND status IN ('activa', 'pasada')`,
      [b.id],
    );
    await db.query(
      `UPDATE refunds
          SET status = 'hecho', stripe_refund_id = $2, stripe_fee_cents = $3,
              recovered_cents = $4, error = $5
        WHERE booking_id = $1`,
      [b.id, result.refund.id, stripeFee, result.recovered, result.reversalError],
    );
    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK").catch(() => {});
    // Stripe ya devolvio: el renglon queda 'en_proceso' y un reintento termina
    // de anotarlo con las mismas llaves (no devuelve otra vez).
    console.error("Reembolso hecho en Stripe pero no anotado", b.id, err);
    throw new RefundError(
      500,
      "El reembolso se hizo en Stripe pero no se pudo anotar. Vuelve a intentarlo: no se devolverá dos veces.",
    );
  } finally {
    db.release();
  }

  // 4. Correos.
  const card = result.card
    ? { brand: result.card.brand, last4: result.card.last4 }
    : null;
  await Promise.all([
    sendRefundToStudent({ booking: b, card }),
    sendRefundToStudio({
      booking: b,
      recoveredCents: result.recovered,
      reason: motivo,
    }),
  ]);

  return {
    refunded_cents: b.price_cents,
    recovered_cents: result.recovered,
    warning: result.reversalError
      ? "Se reembolsó al alumno, pero no se pudo recuperar todo del estudio. Quedó anotado."
      : null,
  };
}

module.exports = { refundBookingByAdmin, blockedReason, RefundError };
