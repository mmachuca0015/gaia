const express = require("express");
const pool = require("../db");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

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
  const { userId, scheduleId, amount } = req.body;

  try {
    // Obtener stripe_customer_id del usuario
    const userResult = await pool.query(
      "SELECT stripe_customer_id FROM users WHERE id = $1",
      [userId],
    );
    const customerId = userResult.rows[0].stripe_customer_id;

    // Obtener el payment method del customer
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
    });
    const paymentMethodId = paymentMethods.data[0].id;

    // Cobrar al customer
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100,
      currency: "mxn",
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: true,
      off_session: true,
    });

    // Crear booking en la base de datos
    await pool.query(
      "INSERT INTO bookings (user_id, schedule_id, status) VALUES ($1, $2, 'activa')",
      [userId, scheduleId],
    );

    await pool.query(
      "UPDATE schedules SET available_spots = available_spots - 1 WHERE id = $1",
      [scheduleId],
    );

    res.json({ message: "Pago exitoso", paymentIntentId: paymentIntent.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al procesar el pago" });
  }
});

module.exports = router;
