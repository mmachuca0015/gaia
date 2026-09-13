// Puente entre la tabla `plans` y Stripe.
//
// Un Price de Stripe es inmutable a proposito: si se pudiera editar, cambiar
// el precio alteraria retroactivamente lo que ya se cobro. Entonces, cuando el
// admin sube o baja un plan, aqui se crea un Price nuevo y se guarda su id. Las
// suscripciones que ya estaban corriendo siguen apuntando al Price viejo hasta
// que se migren, que es justo el comportamiento que se espera de un cambio de
// tarifa.
//
// Cada plan tiene dos Prices: mensual y anual. Son objetos distintos en Stripe
// porque cambian el intervalo y el monto.
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const pool = require("../db");

// Monto anual con el descuento ya aplicado. Se calcula igual que en la consulta
// que alimenta a la landing, para que lo que se muestra sea exactamente lo que
// se cobra.
function annualCents(plan) {
  return Math.round((plan.price_cents * 12 * (100 - plan.annual_discount)) / 100);
}

// Devuelve el id del Price vigente del plan para el intervalo pedido, creando
// el Product y el Price en Stripe si hacen falta o si el monto de la base ya no
// coincide.
async function ensureStripePrice(plan, interval = "month") {
  const isYear = interval === "year";
  const amount = isYear ? annualCents(plan) : plan.price_cents;
  const column = isYear ? "stripe_price_id_year" : "stripe_price_id";
  const savedPriceId = isYear ? plan.stripe_price_id_year : plan.stripe_price_id;

  let productId = plan.stripe_product_id;
  if (!productId) {
    const product = await stripe.products.create({
      name: `Wellco ${plan.name}`,
      description: plan.tagline || undefined,
      metadata: { plan_slug: plan.slug },
    });
    productId = product.id;
    await pool.query("UPDATE plans SET stripe_product_id = $1 WHERE id = $2", [
      productId,
      plan.id,
    ]);
  }

  // Si ya hay un Price guardado, se comprueba que siga valiendo lo mismo antes
  // de reusarlo. Sin esta comparacion, un cambio de precio en el admin no se
  // reflejaria en el cobro.
  if (savedPriceId) {
    const current = await stripe.prices.retrieve(savedPriceId).catch(() => null);
    if (
      current &&
      current.active &&
      current.unit_amount === amount &&
      current.currency === plan.currency &&
      current.recurring?.interval === interval
    ) {
      return savedPriceId;
    }
    // El Price viejo se desactiva para que no se pueda usar en suscripciones
    // nuevas, pero no se borra: las que ya lo usan lo siguen necesitando.
    if (current && current.active) {
      await stripe.prices.update(savedPriceId, { active: false });
    }
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: amount,
    currency: plan.currency,
    recurring: { interval },
    metadata: { plan_slug: plan.slug, interval },
  });

  await pool.query(
    `UPDATE plans SET ${column} = $1, updated_at = NOW() WHERE id = $2`,
    [price.id, plan.id],
  );

  return price.id;
}

// Cupon de bienvenida: se aplica una sola vez, al primer recibo. `duration:
// once` es lo que hace que el segundo mes ya se cobre completo.
//
// Solo aplica al plan mensual. El anual ya trae su propio descuento y los dos
// no se acumulan.
async function ensureIntroCoupon(percent) {
  if (!percent || percent <= 0) return null;

  const couponId = `wellco-intro-${percent}`;
  const existing = await stripe.coupons.retrieve(couponId).catch(() => null);
  if (existing && existing.valid) return couponId;

  const coupon = await stripe.coupons.create({
    id: couponId,
    percent_off: percent,
    duration: "once",
    name: `Bienvenida ${percent}% el primer mes`,
  });
  return coupon.id;
}

module.exports = { stripe, ensureStripePrice, ensureIntroCoupon, annualCents };
