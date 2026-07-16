const express = require("express");
const pool = require("../db");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

router.post("/create-payment-intent", async (req, res) => {
  const { amount } = req.body;

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100, // Stripe usa centavos
      currency: "mxn",
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al crear el pago" });
  }
});

router.post("/create-setup-intent", async (req, res) => {
  try {
    const setupIntent = await stripe.setupIntents.create({
      payment_method_types: ["card"],
    });
    res.json({ clientSecret: setupIntent.client_secret });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al crear setup intent" });
  }
});

router.post("/save-card", async (req, res) => {
  const { paymentMethodId, userId, email } = req.body;

  try {
    // Crear Customer en Stripe
    const customer = await stripe.customers.create({
      email,
      payment_method: paymentMethodId,
    });

    // Guardar stripe_customer_id en la base de datos
    await pool.query("UPDATE users SET stripe_customer_id = $1 WHERE id = $2", [
      customer.id,
      userId,
    ]);

    res.json({
      message: "Tarjeta guardada correctamente",
      customerId: customer.id,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al guardar la tarjeta" });
  }
});

router.get("/card/:customerId", async (req, res) => {
  const { customerId } = req.params;
  try {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
    });

    if (paymentMethods.data.length === 0) {
      return res.json(null);
    }

    const card = paymentMethods.data[0].card;
    res.json({
      brand: card.brand,
      last4: card.last4,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener tarjeta" });
  }
});

router.delete("/card/:customerId", async (req, res) => {
  const { customerId } = req.params;
  const { userId } = req.body;
  try {
    // Obtener payment methods del customer
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
    });

    // Desadjuntar cada payment method
    for (const pm of paymentMethods.data) {
      await stripe.paymentMethods.detach(pm.id);
    }

    // Borrar stripe_customer_id de la base de datos
    await pool.query(
      "UPDATE users SET stripe_customer_id = NULL WHERE id = $1",
      [userId],
    );

    res.json({ message: "Tarjeta eliminada correctamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al eliminar tarjeta" });
  }
});

router.post("/charge", async (req, res) => {
  const { userId, scheduleId, amount, classDate } = req.body;

  try {
    // Obtener stripe_account_id del estudio
    const studioResult = await pool.query(
      "SELECT stripe_account_id FROM studios WHERE id = (SELECT studio_id FROM classes WHERE id = (SELECT class_id FROM schedules WHERE id = $1))",
      [scheduleId],
    );
    const stripeAccountId = studioResult.rows[0]?.stripe_account_id;

    // Obtener stripe_customer_id del usuario
    const userResult = await pool.query(
      "SELECT stripe_customer_id FROM users WHERE id = $1",
      [userId],
    );
    const customerId = userResult.rows[0].stripe_customer_id;

    const existingBooking = await pool.query(
      "SELECT id FROM bookings WHERE user_id = $1 AND schedule_id = $2 AND class_date = $3 AND status = 'activa'",
      [userId, scheduleId, classDate],
    );

    if (existingBooking.rows.length > 0) {
      return res
        .status(400)
        .json({ error: "Ya tienes una reserva para esta clase" });
    }

    // Obtener el payment method del customer
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
    });
    const paymentMethodId = paymentMethods.data[0].id;

    // Calcular comisión de PILA
    const pilaCommission = Math.round(amount * 100 * 0.036);

    // Cobrar al customer
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100,
      currency: "mxn",
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: true,
      off_session: true,
      transfer_data: {
        destination: stripeAccountId,
        amount: amount * 100 - pilaCommission,
      },
    });

    // Crear booking en la base de datos
    await pool.query(
      "INSERT INTO bookings (user_id, schedule_id, status, class_date) VALUES ($1, $2, 'activa', $3)",
      [userId, scheduleId, classDate],
    );

    // Restar lugar disponible
    await pool.query(
      "UPDATE schedules SET available_spots = available_spots - 1 WHERE id = $1",
      [scheduleId],
    );

    // Obtener datos del usuario y la clase
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
  FROM users
  JOIN bookings ON bookings.user_id = users.id
  JOIN schedules ON bookings.schedule_id = schedules.id
  JOIN classes ON schedules.class_id = classes.id
  JOIN studios ON classes.studio_id = studios.id
  LEFT JOIN instructors ON classes.instructor_id = instructors.id
  WHERE users.id = $1
  ORDER BY bookings.created_at DESC
  LIMIT 1
`,
      [userId],
    );

    const booking = emailData.rows[0];

    try {
      await resend.emails.send({
        from: "PILA <onboarding@resend.dev>",
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
    <p>El equipo de PILA</p>
  `,
      });
    } catch (error) {
      console.error("Error enviando email:", error);
    }

    res.json({ message: "Pago exitoso", paymentIntentId: paymentIntent.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al procesar el pago" });
  }
});

router.post("/create-connect-account", async (req, res) => {
  const { studioId } = req.body;
  try {
    // Crear cuenta de Stripe Connect
    const account = await stripe.accounts.create({
      type: "express",
      country: "MX",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    // Guardar el account_id en la base de datos
    await pool.query(
      "UPDATE studios SET stripe_account_id = $1 WHERE id = $2",
      [account.id, studioId],
    );

    // Generar link de onboarding
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: "http://localhost:5173/owner/estudio/pagos",
      return_url: "http://localhost:5173/owner/estudio/pagos",
      type: "account_onboarding",
    });

    res.json({ url: accountLink.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al crear cuenta de Stripe" });
  }
});

module.exports = router;
