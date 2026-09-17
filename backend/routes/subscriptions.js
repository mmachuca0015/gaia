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

// Fin del periodo pagado, segun Stripe. En la API 2026-04 vive en el item, no
// en la suscripcion.
function periodEnd(stripeSub) {
  return stripeSub?.items?.data?.[0]?.current_period_end ?? null;
}

// Estado de la suscripcion del dueño de la sesion. Lo usan el aviso de pago
// pendiente y la pantalla de suscripcion.
router.get("/me", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const sub = await loadOwnerSubscription(req.user.id);
    // Los dueños que se registraron antes de que existieran los planes no
    // tienen fila. No se les bloquea el panel: se reportan como heredados.
    // Un estudio demo no paga ni ve avisos de pago, tenga fila o no.
    if (!sub) {
      const { rows } = await pool.query(
        "SELECT 1 FROM studios WHERE owner_id = $1 AND is_demo",
        [req.user.id],
      );
      return res.json({ status: rows.length > 0 ? "demo" : "heredada" });
    }
    if (sub.is_demo) return res.json({ status: "demo" });

    // La fecha del siguiente cobro solo llega por webhook. Si ese evento se
    // perdio, se le pregunta a Stripe una vez y se guarda: sin ella la
    // pantalla no puede decir cuando termina el periodo.
    if (sub.status === "activa" && !sub.current_period_end && sub.stripe_subscription_id) {
      const stripeSub = await stripe.subscriptions
        .retrieve(sub.stripe_subscription_id)
        .catch(() => null);
      const end = periodEnd(stripeSub);
      if (end) {
        // Si esta activa, el periodo actual esta pagado.
        const { rows } = await pool.query(
          `UPDATE subscriptions
           SET current_period_end = to_timestamp($1),
               paid_until = COALESCE(paid_until, to_timestamp($1))
           WHERE id = $2 RETURNING current_period_end, paid_until`,
          [end, sub.subscription_id],
        );
        sub.current_period_end = rows[0].current_period_end;
        sub.paid_until = rows[0].paid_until;
      }
    }

    const {
      subscription_id: _id,
      stripe_subscription_id: _stripeId,
      pending_plan_id,
      pending_plan_name,
      pending_price_cents,
      pending_annual_price_cents,
      ...rest
    } = sub;
    res.json({
      ...rest,
      pending_plan: pending_plan_id
        ? {
            id: pending_plan_id,
            name: pending_plan_name,
            price_cents: pending_price_cents,
            annual_price_cents: pending_annual_price_cents,
          }
        : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener la suscripcion" });
  }
});

// Cancelar, reanudar y cambiar de plan solo tienen sentido sobre una
// suscripcion que esta cobrando. Devuelve el mensaje de error o null.
function notManageable(sub) {
  if (!sub) return "Tu estudio no tiene un plan contratado";
  if (sub.is_demo) return "Las cuentas demo no tienen suscripcion";
  if (sub.status !== "activa" || !sub.stripe_subscription_id) {
    return "Tu suscripcion no esta activa";
  }
  return null;
}

// Cambia el precio del item de la suscripcion en Stripe SIN prorrateo: el
// periodo actual ya se pago y no se toca, y el precio nuevo se cobra en la
// siguiente renovacion.
async function setStripePlan(sub, plan) {
  const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
  const item = stripeSub.items.data[0];
  const interval = sub.billing_interval === "year" ? "year" : "month";
  const priceId = await ensureStripePrice(plan, interval);
  if (item.price.id === priceId) return stripeSub;
  return stripe.subscriptions.update(sub.stripe_subscription_id, {
    items: [{ id: item.id, price: priceId }],
    proration_behavior: "none",
  });
}

const PLAN_FOR_STRIPE = `
  SELECT id, slug, name, tagline, price_cents, currency, annual_discount,
         stripe_product_id, stripe_price_id, stripe_price_id_year
  FROM plans WHERE id = $1`;

// Deja de renovar al terminar el periodo pagado. Hasta ese dia el estudio
// sigue publicado; despues Stripe borra la suscripcion y el webhook la marca
// 'cancelada', que es lo que la saca del catalogo.
router.post("/cancel", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const sub = await loadOwnerSubscription(req.user.id);
    const error = notManageable(sub);
    if (error) return res.status(409).json({ error });

    // Un cambio de plan programado se deshace: si el dueño reanuda despues,
    // debe volver al plan que tiene, no a uno que eligio antes de cancelar.
    if (sub.pending_plan_id) {
      const { rows } = await pool.query(PLAN_FOR_STRIPE, [sub.plan_id]);
      await setStripePlan(sub, rows[0]);
    }

    const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
    await pool.query(
      `UPDATE subscriptions
       SET cancel_at_period_end = TRUE, pending_plan_id = NULL,
           current_period_end = COALESCE(to_timestamp($1), current_period_end),
           updated_at = NOW()
       WHERE id = $2`,
      [periodEnd(updated), sub.subscription_id],
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No pudimos cancelar tu suscripcion" });
  }
});

// Arrepentirse antes de que termine el periodo: vuelve a renovar normal.
router.post("/resume", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const sub = await loadOwnerSubscription(req.user.id);
    const error = notManageable(sub);
    if (error) return res.status(409).json({ error });

    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: false,
    });
    await pool.query(
      `UPDATE subscriptions SET cancel_at_period_end = FALSE, updated_at = NOW()
       WHERE id = $1`,
      [sub.subscription_id],
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No pudimos reanudar tu suscripcion" });
  }
});

// Programa el cambio de plan para la siguiente renovacion. Elegir el plan
// actual deshace un cambio programado.
router.post("/change-plan", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const sub = await loadOwnerSubscription(req.user.id);
    const error = notManageable(sub);
    if (error) return res.status(409).json({ error });
    if (sub.cancel_at_period_end) {
      return res
        .status(409)
        .json({ error: "Reanuda tu suscripcion antes de cambiar de plan" });
    }

    const planId = Number(req.body.plan_id);
    const { rows } = await pool.query(`${PLAN_FOR_STRIPE} AND is_active = TRUE`, [
      planId,
    ]);
    // El plan actual se acepta aunque el admin lo haya desactivado: volver a
    // el es cancelar el cambio, no contratar una tarifa retirada.
    let target = rows[0];
    if (!target && planId === sub.plan_id) {
      target = (await pool.query(PLAN_FOR_STRIPE, [planId])).rows[0];
    }
    if (!target) {
      return res.status(400).json({ error: "El plan seleccionado no esta disponible" });
    }

    const backToCurrent = target.id === sub.plan_id;
    if (backToCurrent && !sub.pending_plan_id) {
      return res.status(400).json({ error: "Ya tienes este plan" });
    }

    await setStripePlan(sub, target);
    await pool.query(
      `UPDATE subscriptions SET pending_plan_id = $1, updated_at = NOW()
       WHERE id = $2`,
      [backToCurrent ? null : target.id, sub.subscription_id],
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No pudimos cambiar tu plan" });
  }
});

// Un estudio con la suscripcion ya terminada elige plan e intervalo antes de
// pagar. El cobro lo arma despues /payment-intent con lo que quede guardado
// aqui, igual que en el registro.
router.post("/select-plan", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const sub = await loadOwnerSubscription(req.user.id);
    if (!sub || sub.is_demo || sub.status !== "cancelada") {
      return res
        .status(409)
        .json({ error: "Solo puedes elegir un plan nuevo si tu suscripción terminó" });
    }

    const interval = req.body.billing_interval;
    if (interval !== "month" && interval !== "year") {
      return res.status(400).json({ error: "Elige pago mensual o anual" });
    }
    const { rows } = await pool.query(
      "SELECT id FROM plans WHERE id = $1 AND is_active = TRUE",
      [Number(req.body.plan_id)],
    );
    if (rows.length === 0) {
      return res.status(400).json({ error: "El plan seleccionado no esta disponible" });
    }

    // Si quedo un intento de pago a medias con otro plan o intervalo, se
    // descarta: /payment-intent lo reusaria y cobraria lo que ya no se eligio.
    if (sub.stripe_subscription_id) {
      const previous = await stripe.subscriptions
        .retrieve(sub.stripe_subscription_id)
        .catch((err) => {
          if (resourceMissing(err)) return null;
          throw err;
        });
      if (previous && previous.status === "incomplete") {
        await stripe.subscriptions.cancel(previous.id);
      }
    }

    // El id viejo se suelta para que los eventos tardios de esa suscripcion
    // (que ya termino) no pisen el estado de la nueva.
    await pool.query(
      `UPDATE subscriptions
       SET plan_id = $1, billing_interval = $2, pending_plan_id = NULL,
           stripe_subscription_id = NULL, cancel_at_period_end = FALSE,
           updated_at = NOW()
       WHERE id = $3`,
      [rows[0].id, interval, sub.subscription_id],
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No pudimos guardar el plan elegido" });
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
                s.started_at IS NOT NULL AS has_paid_before,
                EXISTS (SELECT 1 FROM studios st
                        WHERE st.owner_id = s.owner_id AND st.is_demo) AS is_demo,
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
      // Una cuenta demo nunca debe generar un cobro real.
      if (sub.is_demo) {
        return res.status(409).json({ error: "Las cuentas demo no tienen suscripcion" });
      }
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

        // 'incomplete': primer cobro sin terminar. 'past_due' / 'unpaid': fallo
        // una renovacion. En los dos casos lo que hay que pagar es la factura
        // abierta de ESA suscripcion; crear otra cobraria dos veces.
        const payable = ["incomplete", "past_due", "unpaid"];
        if (existing && payable.includes(existing.status)) {
          const clientSecret = extractClientSecret(existing.latest_invoice);
          if (clientSecret) {
            return res.json({
              clientSecret,
              amount: existing.latest_invoice?.amount_due ?? null,
              currency: existing.latest_invoice?.currency ?? sub.currency,
              reused: true,
            });
          }
          if (existing.status !== "incomplete") {
            console.error(
              "Renovacion vencida sin factura por pagar",
              existing.id,
              existing.latest_invoice?.status,
            );
            return res.status(409).json({
              error: "No encontramos el cobro pendiente. Escríbenos para resolverlo.",
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
      // plan mensual porque el anual ya trae su descuento metido en el precio.
      //
      // Quien ya pago alguna vez (un estudio que cancelo y vuelve) no recibe
      // ninguno de los dos: la bienvenida y el cupon fueron para su primera
      // contratacion.
      let couponId = null;
      if (sub.has_paid_before) {
        couponId = null;
      } else if (sub.coupon_code) {
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
        // Un cambio de plan programado se aplica con el primer cobro de
        // renovacion, que es el primero que ya sale con el precio nuevo.
        const renewal = invoice.billing_reason === "subscription_cycle";
        // Hasta donde cubre este cobro: el fin del periodo de servicio de sus
        // lineas. El invoice.period_end de Stripe NO sirve para esto: en una
        // renovacion apunta al periodo anterior.
        const coveredUntil = Math.max(
          0,
          ...(invoice.lines?.data ?? []).map((line) => line.period?.end ?? 0),
        );
        await pool.query(
          `UPDATE subscriptions
           SET status = 'activa',
               started_at = COALESCE(started_at, NOW()),
               paid_until = CASE WHEN $3 > 0
                                 THEN GREATEST(paid_until, to_timestamp($3))
                                 ELSE paid_until END,
               plan_id = CASE WHEN $2 THEN COALESCE(pending_plan_id, plan_id)
                              ELSE plan_id END,
               pending_plan_id = CASE WHEN $2 THEN NULL ELSE pending_plan_id END,
               updated_at = NOW()
           WHERE stripe_subscription_id = $1`,
          [typeof subId === "string" ? subId : subId.id, renewal, coveredUntil],
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
        // La cancelacion tambien puede hacerse desde el dashboard de Stripe,
        // que a veces la expresa con una fecha (cancel_at) en vez del flag.
        const cancelling = Boolean(s.cancel_at_period_end || s.cancel_at);
        await pool.query(
          `UPDATE subscriptions
           SET status = $1,
               current_period_end = to_timestamp($2),
               cancel_at_period_end = $4,
               updated_at = NOW()
           WHERE stripe_subscription_id = $3`,
          [status, periodEnd(s), s.id, cancelling],
        );
        break;
      }

      // Termino el periodo de una suscripcion cancelada (o se borro a mano).
      // 'cancelada' es lo que saca al estudio del catalogo.
      case "customer.subscription.deleted": {
        await pool.query(
          `UPDATE subscriptions
           SET status = 'cancelada', cancel_at_period_end = FALSE,
               pending_plan_id = NULL, updated_at = NOW()
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
