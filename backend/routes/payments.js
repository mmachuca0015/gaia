const express = require("express");
const pool = require("../db");
const router = express.Router();
const { stripe, resourceMissing } = require("../services/stripe");

const { requireAuth, requireRole } = require("../middleware/auth");
const { STUDIO_PUBLISHED, viewerIsDemo } = require("../services/catalog");
const {
  SERVICE_FEE_PERCENT,
  splitCharge,
  splitMetadata,
  getCustomerId,
  studioCanReceive,
  savedCard,
} = require("../services/charges");
const { sendBookingConfirmation } = require("../services/bookingEmail");

const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")[0]
  .trim();

// Cuotas vigentes, para que la interfaz muestre exactamente lo que se va a
// cobrar. Publico y de solo lectura: no revela nada que el cliente no vea ya
// en su recibo, y evita tener el numero escrito en dos lugares que se puedan
// desincronizar.
router.get("/fees", (req, res) => {
  res.json({ service_fee_percent: SERVICE_FEE_PERCENT });
});



router.post(
  "/create-setup-intent",
  requireAuth,
  requireRole("user"),
  async (req, res) => {
    try {
      const setupIntent = await stripe.setupIntents.create({
        payment_method_types: ["card"],
      });
      res.json({ clientSecret: setupIntent.client_secret });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al crear setup intent" });
    }
  },
);

router.post(
  "/save-card",
  requireAuth,
  requireRole("user"),
  async (req, res) => {
    const { paymentMethodId } = req.body;

    try {
      // El correo se lee de la base de datos, no del body: si lo mandara el
      // cliente podria crear un Customer de Stripe a nombre de otra persona.
      const { rows } = await pool.query(
        "SELECT email, stripe_customer_id FROM users WHERE id = $1",
        [req.user.id],
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }

      const customer = await stripe.customers.create({
        email: rows[0].email,
        payment_method: paymentMethodId,
      });

      await pool.query(
        "UPDATE users SET stripe_customer_id = $1 WHERE id = $2",
        [customer.id, req.user.id],
      );

      res.json({
        message: "Tarjeta guardada correctamente",
        customerId: customer.id,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al guardar la tarjeta" });
    }
  },
);

// La tarjeta se consulta por el customer de la SESION. Antes el customerId
// venia en la URL, asi que cualquiera que conociera un id de Stripe podia ver
// la tarjeta de otra persona.
router.get("/card", requireAuth, requireRole("user"), async (req, res) => {
  try {
    const customerId = await getCustomerId(req.user.id);
    if (!customerId) return res.json(null);

    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
    });

    if (paymentMethods.data.length === 0) {
      return res.json(null);
    }

    const card = paymentMethods.data[0].card;
    res.json({ brand: card.brand, last4: card.last4 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener tarjeta" });
  }
});

router.delete("/card", requireAuth, requireRole("user"), async (req, res) => {
  try {
    const customerId = await getCustomerId(req.user.id);
    if (!customerId) {
      return res.json({ message: "No hay tarjeta que eliminar" });
    }

    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
    });

    for (const pm of paymentMethods.data) {
      await stripe.paymentMethods.detach(pm.id);
    }

    await pool.query(
      "UPDATE users SET stripe_customer_id = NULL WHERE id = $1",
      [req.user.id],
    );

    res.json({ message: "Tarjeta eliminada correctamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al eliminar tarjeta" });
  }
});

router.post("/charge", requireAuth, requireRole("user"), async (req, res) => {
  const { scheduleId, classDate } = req.body;
  const userId = req.user.id;

  const client = await pool.connect();
  try {
    if (!scheduleId || !classDate) {
      return res.status(400).json({ error: "Faltan datos de la reserva" });
    }

    // EL PRECIO SE LEE DE LA BASE DE DATOS. Antes llegaba en el body, asi que
    // el cliente decidia cuanto pagar por la clase.
    const classInfo = await client.query(
      `SELECT classes.price, classes.id AS class_id,
              studios.id AS studio_id, studios.stripe_account_id,
              studios.is_demo AS studio_is_demo,
              ${STUDIO_PUBLISHED} AS published
       FROM schedules
       JOIN classes ON classes.id = schedules.class_id
       JOIN studios ON studios.id = classes.studio_id
       WHERE schedules.id = $1`,
      [scheduleId],
    );
    if (classInfo.rows.length === 0) {
      return res.status(404).json({ error: "Clase no encontrada" });
    }

    const {
      price,
      studio_id: studioId,
      stripe_account_id: stripeAccountId,
      studio_is_demo: studioIsDemo,
      published,
    } = classInfo.rows[0];

    // Cuentas demo. Estudio demo y usuario demo: la reserva es real en la base
    // pero no se cobra. Cualquier mezcla se rechaza: un usuario real no debe
    // ver el estudio demo, y un usuario demo no debe llenar lugares de un
    // estudio real (ni pagar con una tarjeta de verdad).
    const userIsDemo = await viewerIsDemo(req.user);
    if (studioIsDemo && !userIsDemo) {
      return res.status(404).json({ error: "Clase no encontrada" });
    }
    if (userIsDemo && !studioIsDemo) {
      return res
        .status(400)
        .json({ error: "Las cuentas demo solo pueden reservar en estudios demo" });
    }
    const simulated = studioIsDemo && userIsDemo;

    const classCents = Math.round(Number(price) * 100);
    if (!Number.isFinite(classCents) || classCents <= 0) {
      return res.status(400).json({ error: "Precio invalido" });
    }

    // Lo que paga el alumno y cuanto se queda cada quien.
    const split = splitCharge(classCents);

    let card = null;
    if (!simulated) {
      // Se valida aqui y no solo en el catalogo: alguien pudo dejar abierta la
      // pagina del estudio antes de que terminara su suscripcion.
      if (!published) {
        return res
          .status(400)
          .json({ error: "Este estudio ya no esta recibiendo reservas" });
      }
      if (
        !stripeAccountId ||
        !(await studioCanReceive(studioId, stripeAccountId))
      ) {
        return res
          .status(400)
          .json({ error: "El estudio aun no puede recibir pagos" });
      }

      card = await savedCard(userId);
      if (!card) {
        return res.status(400).json({ error: "No tienes una tarjeta guardada" });
      }
    }

    // Reserva y lugar disponible se tocan dentro de una transaccion, con el
    // renglon del horario bloqueado: sin esto dos peticiones simultaneas
    // podian vender el mismo ultimo lugar dos veces.
    await client.query("BEGIN");

    const schedule = await client.query(
      "SELECT available_spots FROM schedules WHERE id = $1 FOR UPDATE",
      [scheduleId],
    );
    if (schedule.rows[0].available_spots <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Ya no hay lugares disponibles" });
    }

    const existingBooking = await client.query(
      "SELECT id FROM bookings WHERE user_id = $1 AND schedule_id = $2 AND class_date = $3 AND status = 'activa'",
      [userId, scheduleId, classDate],
    );
    if (existingBooking.rows.length > 0) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Ya tienes una reserva para esta clase" });
    }

    if (split.studioAmount <= 0) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "El precio de la clase es demasiado bajo para cobrarse" });
    }

    const paymentIntent = simulated
      ? null
      : await stripe.paymentIntents.create({
          amount: split.amountCents,
          currency: "mxn",
          customer: card.customerId,
          payment_method: card.paymentMethodId,
          confirm: true,
          off_session: true,
          transfer_data: {
            destination: stripeAccountId,
            amount: split.studioAmount,
          },
          metadata: { tipo: "clase", ...splitMetadata(classCents, split) },
        });

    const bookingResult = await client.query(
      "INSERT INTO bookings (user_id, schedule_id, status, class_date) VALUES ($1, $2, 'activa', $3) RETURNING id",
      [userId, scheduleId, classDate],
    );

    await client.query(
      "UPDATE schedules SET available_spots = available_spots - 1 WHERE id = $1",
      [scheduleId],
    );

    await client.query("COMMIT");

    await sendBookingConfirmation(
      bookingResult.rows[0].id,
      simulated
        ? "Reserva de demostración, sin cobro"
        : `$${(split.amountCents / 100).toFixed(2)} MXN`,
    );

    res.json({
      message: simulated ? "Reserva demo confirmada" : "Pago exitoso",
      paymentIntentId: paymentIntent?.id ?? null,
      simulated,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Error al procesar el pago" });
  } finally {
    client.release();
  }
});

// Onboarding de Stripe Connect. El estudio se toma de la sesion del dueño:
// antes el studioId llegaba en el body, asi que cualquiera podia sobrescribir
// el stripe_account_id de otro estudio y desviarse sus cobros.
router.post(
  "/create-connect-account",
  requireAuth,
  requireRole("owner"),
  async (req, res) => {
    try {
      const studioResult = await pool.query(
        "SELECT id, stripe_account_id FROM studios WHERE owner_id = $1",
        [req.user.id],
      );
      if (studioResult.rows.length === 0) {
        return res.status(404).json({ error: "Estudio no encontrado" });
      }
      const studioId = studioResult.rows[0].id;

      // Si ya hay una cuenta valida se reusa y solo se genera un enlace nuevo.
      // Los enlaces de onboarding caducan, asi que volver aqui es normal: sin
      // esta comprobacion, cada regreso creaba OTRA cuenta Connect y dejaba
      // huerfana la anterior, con el papeleo que el dueño ya habia llenado.
      //
      // Tambien es el camino del corte a live: el `acct_` de modo prueba no
      // existe con la llave nueva, se descarta y el dueño se da de alta otra
      // vez, ahora en la cuenta real.
      let accountId = studioResult.rows[0].stripe_account_id;
      if (accountId) {
        const existing = await stripe.accounts
          .retrieve(accountId)
          .catch((err) => {
            if (resourceMissing(err)) return null;
            throw err;
          });
        if (!existing) accountId = null;
      }

      if (!accountId) {
        const account = await stripe.accounts.create({
          type: "express",
          country: "MX",
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
        });
        accountId = account.id;

        await pool.query(
          "UPDATE studios SET stripe_account_id = $1 WHERE id = $2",
          [accountId, studioId],
        );
      }

      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${FRONTEND_URL}/owner/estudio/pagos`,
        return_url: `${FRONTEND_URL}/owner/estudio/pagos`,
        type: "account_onboarding",
      });

      res.json({ url: accountLink.url });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al crear cuenta de Stripe" });
    }
  },
);

// Se elimino /create-payment-intent: recibia el monto del body y no lo usaba
// ninguna pantalla. El cobro real pasa por /charge, que lee el precio de la
// base de datos.

module.exports = router;
