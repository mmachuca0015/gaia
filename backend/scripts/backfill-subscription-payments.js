// Carga en subscription_payments las facturas pagadas que ya estaban en
// Stripe antes de que el webhook las guardara. Se puede correr varias veces:
// las que ya estan se saltan.
//
//   node scripts/backfill-subscription-payments.js   (dentro de /backend)
//
// Usa la STRIPE_SECRET_KEY del .env: con la de prueba carga las de prueba,
// con la live las reales.
const pool = require("../db");
const { stripe } = require("../services/stripe");
const { recordSubscriptionPayment } = require("../services/subscriptionPayments");

(async () => {
  let vistas = 0;
  const antes = Number(
    (await pool.query("SELECT COUNT(*) FROM subscription_payments")).rows[0].count,
  );

  for await (const invoice of stripe.invoices.list({ status: "paid", limit: 100 })) {
    await recordSubscriptionPayment(invoice);
    vistas += 1;
  }

  const despues = Number(
    (await pool.query("SELECT COUNT(*) FROM subscription_payments")).rows[0].count,
  );
  console.log(`${vistas} facturas pagadas en Stripe, ${despues - antes} nuevas en la base`);
  await pool.end();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
