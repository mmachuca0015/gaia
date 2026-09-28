// Registro de los cobros de suscripcion (tabla subscription_payments), para
// las graficas del admin. Lo llama el webhook `invoice.paid` y el script de
// carga de facturas viejas; los dos pasan por aqui para guardar lo mismo.
const pool = require("../db");

function subscriptionIdOf(invoice) {
  const subId =
    invoice.subscription ?? invoice.parent?.subscription_details?.subscription;
  if (!subId) return null;
  return typeof subId === "string" ? subId : subId.id;
}

/**
 * Guarda una factura pagada. Si ya estaba (reintento del webhook o el script
 * corrido dos veces) no hace nada.
 *
 * `total_excluding_tax` es el plan ya con cupones y sin IVA; el IVA es lo que
 * falta para `total`. Se guarda aparte porque no es ingreso de Wellco.
 */
async function recordSubscriptionPayment(invoice) {
  const subId = subscriptionIdOf(invoice);
  if (!subId) return;

  const total = invoice.total ?? 0;
  const net = invoice.total_excluding_tax ?? total;
  const paidAt = invoice.status_transitions?.paid_at ?? invoice.created;

  await pool.query(
    `INSERT INTO subscription_payments
       (stripe_invoice_id, stripe_subscription_id, net_cents, tax_cents,
        paid_cents, currency, billing_reason, paid_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8))
     ON CONFLICT (stripe_invoice_id) DO NOTHING`,
    [
      invoice.id,
      subId,
      net,
      total - net,
      invoice.amount_paid ?? 0,
      invoice.currency || "mxn",
      invoice.billing_reason ?? null,
      paidAt,
    ],
  );
}

module.exports = { recordSubscriptionPayment, subscriptionIdOf };
