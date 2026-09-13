const express = require("express");
const pool = require("../db");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

const { requireAuth, requireRole } = require("../middleware/auth");

const COMMISSION_RATE = 0.036; // 3.6% por transaccion
const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")[0]
  .trim();

// Devuelve el stripe_customer_id del usuario de la sesion, o null.
async function getCustomerId(userId) {
  const { rows } = await pool.query(
    "SELECT stripe_customer_id FROM users WHERE id = $1",
    [userId],
  );
  return rows[0]?.stripe_customer_id ?? null;
}

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
      `SELECT classes.price, classes.id AS class_id, studios.stripe_account_id
       FROM schedules
       JOIN classes ON classes.id = schedules.class_id
       JOIN studios ON studios.id = classes.studio_id
       WHERE schedules.id = $1`,
      [scheduleId],
    );
    if (classInfo.rows.length === 0) {
      return res.status(404).json({ error: "Clase no encontrada" });
    }

    const { price, stripe_account_id: stripeAccountId } = classInfo.rows[0];
    if (!stripeAccountId) {
      return res
        .status(400)
        .json({ error: "El estudio aun no puede recibir pagos" });
    }

    const amountCents = Math.round(Number(price) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return res.status(400).json({ error: "Precio invalido" });
    }

    const customerId = await getCustomerId(userId);
    if (!customerId) {
      return res.status(400).json({ error: "No tienes una tarjeta guardada" });
    }

    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
    });
    if (paymentMethods.data.length === 0) {
      return res.status(400).json({ error: "No tienes una tarjeta guardada" });
    }
    const paymentMethodId = paymentMethods.data[0].id;

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

    const pilaCommission = Math.round(amountCents * COMMISSION_RATE);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "mxn",
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: true,
      off_session: true,
      transfer_data: {
        destination: stripeAccountId,
        amount: amountCents - pilaCommission,
      },
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

    // El correo se arma con la reserva recien creada, no con "la ultima del
    // usuario", que en concurrencia podia ser otra.
    const emailData = await pool.query(
      `
  SELECT
    users.name,
    users.email,
    classes.name AS class_name,
    COALESCE(instructors.name || ' ' || instructors.last_name, classes.instructor) AS instructor,
    CASE schedules.day
      WHEN 0 THEN 'Domingo'
      WHEN 1 THEN 'Lunes'
      WHEN 2 THEN 'Martes'
      WHEN 3 THEN 'Miércoles'
      WHEN 4 THEN 'Jueves'
      WHEN 5 THEN 'Viernes'
      WHEN 6 THEN 'Sábado'
    END AS day,
    schedules.time,
    studios.name AS studio_name,
    classes.price
  FROM bookings
  JOIN users ON users.id = bookings.user_id
  JOIN schedules ON bookings.schedule_id = schedules.id
  JOIN classes ON schedules.class_id = classes.id
  JOIN studios ON classes.studio_id = studios.id
  LEFT JOIN instructors ON classes.instructor_id = instructors.id
  WHERE bookings.id = $1
`,
      [bookingResult.rows[0].id],
    );

    const booking = emailData.rows[0];

    try {
      await resend.emails.send({
        from: "Wellco <onboarding@resend.dev>",
        to: booking.email,
        subject: "¡Reserva confirmada!",
        html: `
    <h2>¡Hola ${booking.name}!</h2>
    <p>Tu reserva ha sido confirmada.</p>
    <p><strong>Clase:</strong> ${booking.class_name}</p>
    <p><strong>Instructor:</strong> ${booking.instructor}</p>
    <p><strong>Estudio:</strong> ${booking.studio_name}</p>
    <p><strong>Día:</strong> ${booking.day}</p>
    <p><strong>Hora:</strong> ${booking.time.slice(0, 5)}</p>
    <p><strong>Total pagado:</strong> $${booking.price} MXN</p>
    <br>
    <p>¡Nos vemos en clase!</p>
    <p>El equipo de Wellco</p>
  `,
      });
    } catch (error) {
      console.error("Error enviando email:", error);
    }

    res.json({ message: "Pago exitoso", paymentIntentId: paymentIntent.id });
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
        "SELECT id FROM studios WHERE owner_id = $1",
        [req.user.id],
      );
      if (studioResult.rows.length === 0) {
        return res.status(404).json({ error: "Estudio no encontrado" });
      }
      const studioId = studioResult.rows[0].id;

      const account = await stripe.accounts.create({
        type: "express",
        country: "MX",
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });

      await pool.query(
        "UPDATE studios SET stripe_account_id = $1 WHERE id = $2",
        [account.id, studioId],
      );

      const accountLink = await stripe.accountLinks.create({
        account: account.id,
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
