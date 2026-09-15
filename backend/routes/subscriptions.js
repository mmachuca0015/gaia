const express = require("express");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { stripe, resourceMissing } = require("../services/stripe");
const {
  ensureStripePrice,
  ensureIntroCoupon,
  ensureCourtesyCoupon,
} = require("../services/stripePlans");

const router = express.Router();

// Estado de la suscripcion del dueño de la sesion. Lo usa el panel para
// decidir si muestra el aviso de pago pendiente.
router.get("/me", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.status, s.current_period_end, s.billing_interval,
              p.name AS plan_name, p.slug AS plan_slug, p.price_cents, p.currency
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
       WHERE s.owner_id = $1`,
      [req.user.id],
    );
    // Los dueños que se registraron antes de que existieran los planes no
    // tienen fila. No se les bloquea el panel: se reportan como heredados.
    if (rows.length === 0) return res.json({ status: "heredada" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener la suscripcion" });
  }
});

// La API 2026-04 ya no expone `invoice.payment_intent`: el secreto para
// confirmar el pago en el navegador vive en `confirmation_secret`. Se intenta
// la forma nueva y se cae a la vieja para no depender de la version exacta.
function extractClientSecret(invoice) {
  return (
    invoice?.confirmation_secret?.client_secret ??
    invoice?.payment_intent?.client_secret ??
    null
  );
}

const SUBSCRIPTION_EXPAND = [
  "latest_invoice.confirmation_secret",
  "latest_invoice.payment_intent",
];

// Prepara el cobro y devuelve el secreto para confirmarlo DENTRO de la app.
//
// No se usa Checkout hospedado: la tarjeta se captura en el formulario y queda
// guardada como metodo de pago por defecto de la suscripcion, que es lo que
// permite el cobro automatico del siguiente periodo.
//
// El owner_id sale de la cookie y el precio de la base: nada de lo que decide
// cuanto se cobra viene del cliente.
router.post(
  "/payment-intent",
  requireAuth,
  requireRole("owner"),
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT s.id AS subscription_id, s.status, s.stripe_customer_id,
                s.stripe_subscription_id, s.billing_interval,
                p.id, p.slug, p.name, p.tagline, p.price_cents, p.currency,
                p.intro_discount, p.annual_discount, p.stripe_product_id,
                p.stripe_price_id, p.stripe_price_id_year,
                o.email, o.name AS owner_name,
                c.code AS coupon_code, c.percent_off AS coupon_percent,
                c.duration_months AS coupon_months
         FROM subscriptions s
         JOIN plans p         ON p.id = s.plan_id
         JOIN studio_owners o ON o.id = s.owner_id
         LEFT JOIN coupons c  ON c.id = s.coupon_id
         WHERE s.owner_id = $1`,
        [req.user.id],
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: "No hay una suscripcion por pagar" });
      }

      const sub = rows[0];
      if (sub.status === "activa") {
        return res.status(409).json({ error: "La suscripcion ya esta activa" });
      }

      // --- Cliente de Stripe
      //
      // El customer guardado se verifica antes de reusarlo. Un `cus_` de modo
      // prueba no existe con la llave live, y el subscriptions.create de mas
      // abajo fallaria dejando al dueño sin poder pagar su plan y sin pista
      // de por que.
      let customerId = sub.stripe_customer_id;
      if (customerId) {
        const customer = await stripe.customers
          .retrieve(customerId)
          .catch((err) => {
            if (resourceMissing(err)) return null;
            throw err;
          });
        if (!customer || customer.deleted) customerId = null;
      }

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: sub.email,
          name: sub.owner_name,
          metadata: { owner_id: String(req.user.id) },
        });
        customerId = customer.id;
        await pool.query(
          "UPDATE subscriptions SET stripe_customer_id = $1, updated_at = NOW() WHERE id = $2",
          [customerId, sub.subscription_id],
        );
      }

      // --- Reusar el intento anterior si lo hay
      //
      // Sin esto, cada vez que el dueño recarga o reintenta se crearia otra
      // suscripcion en Stripe y acabaria con varias a medio pagar.
      if (sub.stripe_subscription_id) {
        const existing = await stripe.subscriptions
          .retrieve(sub.stripe_subscription_id, { expand: SUBSCRIPTION_EXPAND })
          .catch((err) => {
            // No existe: quedo en el otro modo o se borro, y mas abajo se crea
            // una nueva. Un error de red, en cambio, se deja subir: tratarlo
            // como "no existe" crearia una SEGUNDA suscripcion de cobro.
            if (resourceMissing(err)) return null;
            throw err;
          });

        if (existing && existing.status === "incomplete") {
          const clientSecret = extractClientSecret(existing.latest_invoice);
          if (clientSecret) {
            return res.json({
              clientSecret,
              amount: existing.latest_invoice?.amount_due ?? null,
              currency: existing.latest_invoice?.currency ?? sub.currency,
              reused: true,
            });
          }
        }
      }

      const interval = sub.billing_interval === "year" ? "year" : "month";
      const priceId = await ensureStripePrice(sub, interval);

      // Un solo descuento por suscripcion, nunca dos.
      //
      // Manda el cupon de cortesia si el dueño canjeo uno al registrarse: es
      // un trato cerrado a mano y siempre pesa mas que la promocion generica.
      // Si no hay cupon, queda el descuento de bienvenida, que es solo del
      // plan mensual porque el anual ya trae su 15% metido en el precio.
      let couponId = null;
      if (sub.coupon_code) {
        couponId = await ensureCourtesyCoupon({
          code: sub.coupon_code,
          percent_off: sub.coupon_percent,
          duration_months: sub.coupon_months,
        });
      } else if (interval === "month") {
        couponId = await ensureIntroCoupon(sub.intro_discount);
      }

      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        discounts: couponId ? [{ coupon: couponId }] : undefined,
        // Nace incompleta: no se cobra nada hasta que el navegador confirme.
        payment_behavior: "default_incomplete",
        payment_settings: {
          // Esto es lo que deja la tarjeta guardada para los cobros
          // automaticos del siguiente mes o año.
          save_default_payment_method: "on_subscription",
        },
        expand: SUBSCRIPTION_EXPAND,
        metadata: {
          owner_id: String(req.user.id),
          plan_slug: sub.slug,
          interval,
        },
      });

      const clientSecret = extractClientSecret(subscription.latest_invoice);
      if (!clientSecret) {
        console.error(
          "Stripe no devolvio client_secret para la suscripcion",
          subscription.id,
        );
        return res.status(500).json({ error: "No pudimos preparar el pago" });
      }

      await pool.query(
        "UPDATE subscriptions SET stripe_subscription_id = $1, updated_at = NOW() WHERE id = $2",
        [subscription.id, sub.subscription_id],
      );

      res.json({
        clientSecret,
        amount: subscription.latest_invoice?.amount_due ?? null,
        currency: subscription.latest_invoice?.currency ?? sub.currency,
        reused: false,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "No pudimos preparar el pago" });
    }
  },
);

// --------------------------------------------------------------- webhook

// Va montado con express.raw en index.js: la firma se calcula sobre el cuerpo
// exacto que mando Stripe, y express.json lo reescribe.
async function webhookHandler(req, res) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("Falta STRIPE_WEBHOOK_SECRET");
    return res.status(500).send("webhook sin configurar");
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      secret,
    );
  } catch (err) {
    // Sin firma valida no se toca la base: cualquiera podria hacer POST aqui
    // y activarse una suscripcion gratis.
    console.error("Firma de webhook invalida:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      // El cobro cerro. Es el unico evento que activa una suscripcion: que el
      // navegador confirme no basta, porque puede cerrarse antes de que
      // Stripe termine, y el cobro puede completarse igual.
      case "invoice.paid": {
        const invoice = event.data.object;
        const subId =
          invoice.subscription ?? invoice.parent?.subscription_details?.subscription;
        if (!subId) break;
        await pool.query(
          `UPDATE subscriptions
           SET status = 'activa', updated_at = NOW()
           WHERE stripe_subscription_id = $1`,
          [typeof subId === "string" ? subId : subId.id],
        );
        break;
      }

      case "customer.subscription.updated": {
        const s = event.data.object;
        // Stripe distingue muchos estados; para el panel solo importa si el
        // dueño puede operar o no.
        const status =
          s.status === "active" || s.status === "trialing"
            ? "activa"
            : s.status === "canceled"
              ? "cancelada"
              : s.status === "incomplete"
                ? "pendiente"
                : "vencida";
        await pool.query(
          `UPDATE subscriptions
           SET status = $1,
               current_period_end = to_timestamp($2),
               updated_at = NOW()
           WHERE stripe_subscription_id = $3`,
          [status, s.items?.data?.[0]?.current_period_end ?? null, s.id],
        );
        break;
      }

      case "customer.subscription.deleted": {
        await pool.query(
          `UPDATE subscriptions SET status = 'cancelada', updated_at = NOW()
           WHERE stripe_subscription_id = $1`,
          [event.data.object.id],
        );
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const subId =
          invoice.subscription ?? invoice.parent?.subscription_details?.subscription;
        if (subId) {
          await pool.query(
            `UPDATE subscriptions SET status = 'vencida', updated_at = NOW()
             WHERE stripe_subscription_id = $1`,
            [typeof subId === "string" ? subId : subId.id],
          );
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (err) {
    // Un 500 hace que Stripe reintente, que es lo que queremos si la base
    // estaba caida un momento.
    console.error("Error procesando el webhook:", err);
    res.status(500).send("error");
  }
}

module.exports = { router, webhookHandler };
