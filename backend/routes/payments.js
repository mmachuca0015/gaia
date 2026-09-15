const express = require("express");
const pool = require("../db");
const router = express.Router();
const { stripe, resourceMissing } = require("../services/stripe");
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

const { requireAuth, requireRole } = require("../middleware/auth");

// Del 7.2% que se va en cada transaccion, Stripe se queda 3.6% por su cuenta
// y este 3.6% es la comision de Wellco. Por eso aqui solo aparece la mitad:
// la de Stripe nunca pasa por nuestro codigo, la descuenta ella.
const COMMISSION_RATE = 0.036;

// Cuota fija de Stripe por transaccion ($3 MXN). La paga el cliente encima del
// precio de la clase, no el estudio.
//
// Es POR TRANSACCION, no por clase: si algun dia se reservan varias clases en
// un mismo cobro, esta cuota se suma una sola vez. Por eso se aplica al armar
// el PaymentIntent y no dentro del calculo de cada clase.
const TRANSACTION_FEE_CENTS = 300;
const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")[0]
  .trim();

// Cuotas vigentes, para que la interfaz muestre exactamente lo que se va a
// cobrar. Publico y de solo lectura: no revela nada que el cliente no vea ya
// en su recibo, y evita tener el numero escrito en dos lugares que se puedan
// desincronizar.
router.get("/fees", (req, res) => {
  res.json({ transaction_fee_cents: TRANSACTION_FEE_CENTS });
});

// Devuelve el stripe_customer_id del usuario de la sesion, o null.
//
// El id guardado se verifica contra Stripe en vez de devolverse a ciegas. Un
// `cus_` creado en modo prueba sigue en la base despues del corte a live y
// alli no existe: sin esta comprobacion, ver la tarjeta o cobrar una clase
// devolvia 500 y el usuario no tenia forma de salir del hoyo.
//
// Cuando el customer ya no existe se limpia la columna y se responde como si
// el usuario nunca hubiera guardado tarjeta, que es exactamente su situacion:
// el metodo de pago vivia en la cuenta de Stripe del otro modo.
async function getCustomerId(userId) {
  const { rows } = await pool.query(
    "SELECT stripe_customer_id FROM users WHERE id = $1",
    [userId],
  );
  const customerId = rows[0]?.stripe_customer_id ?? null;
  if (!customerId) return null;

  const customer = await stripe.customers.retrieve(customerId).catch((err) => {
    if (resourceMissing(err)) return null;
    throw err;
  });

  if (!customer || customer.deleted) {
    await pool.query(
      "UPDATE users SET stripe_customer_id = NULL WHERE id = $1",
      [userId],
    );
    return null;
  }

  return customerId;
}

// ¿La cuenta Connect del estudio puede recibir su parte del cobro?
//
// Se pregunta ANTES de abrir la transaccion y de crear el PaymentIntent. Si se
// dejara fallar al cobrar, el error de Stripe saldria como 500 generico y el
// cliente no sabria que el problema es del estudio, no de su tarjeta.
//
// Dos casos distintos, misma respuesta para el cliente:
//   - la cuenta no existe (un `acct_` de modo prueba tras el corte a live),
//     y entonces se limpia para que el dueño vea de nuevo el boton de alta;
//   - la cuenta existe pero no tiene activas las transferencias, porque el
//     dueño no termino el onboarding o Stripe le pidio documentos.
async function studioCanReceive(studioId, stripeAccountId) {
  const account = await stripe.accounts.retrieve(stripeAccountId).catch((err) => {
    if (resourceMissing(err)) return null;
    throw err;
  });

  if (!account) {
    await pool.query(
      "UPDATE studios SET stripe_account_id = NULL WHERE id = $1",
      [studioId],
    );
    return false;
  }

  return account.capabilities?.transfers === "active";
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
      `SELECT classes.price, classes.id AS class_id,
              studios.id AS studio_id, studios.stripe_account_id
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
    } = classInfo.rows[0];
    if (
      !stripeAccountId ||
      !(await studioCanReceive(studioId, stripeAccountId))
    ) {
      return res
        .status(400)
        .json({ error: "El estudio aun no puede recibir pagos" });
    }

    const classCents = Math.round(Number(price) * 100);
    if (!Number.isFinite(classCents) || classCents <= 0) {
      return res.status(400).json({ error: "Precio invalido" });
    }

    // Total de la transaccion: es la base sobre la que se calculan LAS DOS
    // comisiones, la de Stripe y la de Wellco.
    const amountCents = classCents + TRANSACTION_FEE_CENTS;

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

    // Reparto del dinero. Las dos comisiones van sobre el TOTAL de la
    // transaccion (clase + cuota), no sobre el precio de la clase.
    //
    //   cliente paga      T = clase + 3
    //   Stripe se queda   3.6% de T + 3
    //   Wellco se queda   3.6% de T
    //   estudio recibe    el resto = clase - 7.2% de T
    //
    // Los 3 pesos del cliente cubren justo el cargo fijo de Stripe, asi que a
    // Wellco le queda limpio su 3.6%.
    //
    // La parte porcentual de Stripe se resta de la transferencia porque Stripe
    // cobra su comision de la cuenta de la plataforma, no de la del estudio:
    // sin restarla aqui, saldria del bolsillo de Wellco y su comision neta
    // quedaria en cero.
    const wellcoCommission = Math.round(amountCents * COMMISSION_RATE);
    const stripePercentFee = Math.round(amountCents * COMMISSION_RATE);
    const studioAmount = classCents - wellcoCommission - stripePercentFee;

    if (studioAmount <= 0) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "El precio de la clase es demasiado bajo para cobrarse" });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "mxn",
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: true,
      off_session: true,
      transfer_data: {
        destination: stripeAccountId,
        amount: studioAmount,
      },
      metadata: {
        clase_centavos: String(classCents),
        cuota_fija_centavos: String(TRANSACTION_FEE_CENTS),
        comision_wellco_centavos: String(wellcoCommission),
        stripe_porcentual_centavos: String(stripePercentFee),
        estudio_centavos: String(studioAmount),
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
