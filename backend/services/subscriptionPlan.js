// Lo que se necesita para leer y mover el plan de un dueño.
//
// Vivia dentro de routes/subscriptions.js, donde solo lo usaba el dueño. Ahora
// el admin tambien cambia planes (para dar apoyo a un estudio), y las dos
// rutas tienen que hacerlo EXACTAMENTE igual: misma consulta, mismo Price de
// Stripe y mismo IVA. Copiarlo en la otra ruta era garantizar que un dia se
// separaran.
const pool = require("../db");
const {
  stripe,
  ensureStripePrice,
  ensureIvaTaxRate,
} = require("./stripePlans");

// Mismo calculo que PLANS_QUERY en routes/plans.js y que annualCents en
// stripePlans.js: lo que se promete en pantalla es lo que se cobra.
const annualSql = (alias) =>
  `ROUND(${alias}.price_cents * 12 * (100 - ${alias}.annual_discount) / 100.0)::int`;

const OWNER_SUBSCRIPTION_QUERY = `
  SELECT s.id AS subscription_id, s.status, s.billing_interval,
         s.current_period_end, s.cancel_at_period_end, s.stripe_subscription_id,
         COALESCE(s.started_at, s.created_at) AS started_at,
         s.started_at IS NOT NULL AS has_paid_before, s.paid_until,
         EXISTS (SELECT 1 FROM studios st
                 WHERE st.owner_id = s.owner_id AND st.is_demo) AS is_demo,
         s.owner_id,
         s.plan_id, p.name AS plan_name, p.slug AS plan_slug,
         p.price_cents, p.currency, ${annualSql("p")} AS annual_price_cents,
         s.pending_plan_id, pp.name AS pending_plan_name,
         pp.price_cents AS pending_price_cents,
         ${annualSql("pp")} AS pending_annual_price_cents
  FROM subscriptions s
  JOIN plans p       ON p.id = s.plan_id
  LEFT JOIN plans pp ON pp.id = s.pending_plan_id
  WHERE s.owner_id = $1`;

async function loadOwnerSubscription(ownerId) {
  const { rows } = await pool.query(OWNER_SUBSCRIPTION_QUERY, [ownerId]);
  return rows[0] ?? null;
}

const PLAN_FOR_STRIPE = `
  SELECT id, slug, name, tagline, price_cents, currency, annual_discount,
         max_studios, notices,
         stripe_product_id, stripe_price_id, stripe_price_id_year
  FROM plans WHERE id = $1`;

/**
 * Cambia el precio del item de la suscripcion en Stripe.
 *
 * `proration` decide quien paga el cambio a media periodo:
 *   - "none" (el cambio del dueño y el programado del admin): el periodo
 *     actual ya se pago y no se toca; el precio nuevo se cobra en la
 *     siguiente renovacion.
 *   - "create_prorations" (el cambio INMEDIATO del admin): Stripe abona lo
 *     que no se uso del plan viejo y cobra lo que queda del nuevo, y la
 *     diferencia sale en el siguiente recibo. No se cobra la tarjeta en este
 *     momento a proposito: el admin esta dando apoyo, y un cargo que falla
 *     dejaria la suscripcion en past_due justo ahi.
 */
async function setStripePlan(sub, plan, proration = "none") {
  const stripeSub = await stripe.subscriptions.retrieve(
    sub.stripe_subscription_id,
  );
  const item = stripeSub.items.data[0];
  const interval = sub.billing_interval === "year" ? "year" : "month";
  const priceId = await ensureStripePrice(plan, interval);
  if (item.price.id === priceId) return stripeSub;
  return stripe.subscriptions.update(sub.stripe_subscription_id, {
    items: [{ id: item.id, price: priceId }],
    proration_behavior: proration,
    // Una suscripcion contratada antes del IVA lo empieza a cobrar con el
    // plan nuevo, igual que las que nacen hoy.
    default_tax_rates: [await ensureIvaTaxRate()],
  });
}

/** Fin del periodo pagado, segun Stripe. En la API 2026-04 vive en el item. */
function periodEnd(stripeSub) {
  return stripeSub?.items?.data?.[0]?.current_period_end ?? null;
}

module.exports = {
  annualSql,
  OWNER_SUBSCRIPTION_QUERY,
  loadOwnerSubscription,
  PLAN_FOR_STRIPE,
  setStripePlan,
  periodEnd,
};
