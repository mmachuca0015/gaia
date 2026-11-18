// Dinero de las reservas y los paquetes: cuanto paga el alumno, cuanto se
// queda cada quien y con que tarjeta se cobra. Lo usan /payments/charge
// (una clase) y la compra de paquetes, para que los dos cobren igual.
const pool = require("../db");
const { stripe, resourceMissing } = require("./stripe");

// Wellco cobra por dos lados, los dos en porcentaje sobre el PRECIO de la
// clase (o del paquete), no sobre el total:
//
//   - Cargo por servicio (3% de arranque) que paga el alumno ENCIMA del precio.
//   - Comision (1.5% de arranque) que se le descuenta al estudio.
//
// Los porcentajes viven en la tabla fee_settings (migracion 022) y los edita
// el admin en /admin/suscripciones. El estudio ademas absorbe la comision
// completa de Stripe (3.6% del total cobrado + $3 fijos, mas el IVA que Stripe
// le carga a esa comision).
//
// Se cachean unos segundos para no ir a la base en cada tarjeta de clase; el
// cambio del admin limpia el cache (invalidateFees) y aplica al momento.
const FEES_TTL_MS = 30 * 1000;
let feesCache = null;
let feesAt = 0;

/** { serviceFeePercent, commissionPercent } vigentes. */
async function getFees() {
  if (feesCache && Date.now() - feesAt < FEES_TTL_MS) return feesCache;
  const { rows } = await pool.query(
    "SELECT service_fee_bp, commission_bp FROM fee_settings WHERE id = 1",
  );
  if (!rows[0]) throw new Error("Falta la fila de fee_settings (migracion 022)");
  feesCache = {
    serviceFeePercent: rows[0].service_fee_bp / 100,
    commissionPercent: rows[0].commission_bp / 100,
  };
  feesAt = Date.now();
  return feesCache;
}

function invalidateFees() {
  feesCache = null;
}

// Lo que cobra Stripe en Mexico por un cargo con tarjeta nacional. Solo se usa
// para restarlo de la transferencia al estudio: Stripe lo descuenta de la
// cuenta de la plataforma, no de la del estudio. La comision real varia con la
// tarjeta (internacional, AmEx), asi que el neto de Wellco es aproximado.
//
// Stripe Mexico le suma 16% de IVA a su comision y lo descuenta junto con ella
// (en el balance sale como `stripe_fee` + `tax`). Sin contarlo, ese IVA salia
// del bolsillo de Wellco: en una clase de $150 se quedaba $5.38 y no $6.75.
const STRIPE_PERCENT = 3.6;
const STRIPE_FIXED_CENTS = 300;
const STRIPE_FEE_IVA_PERCENT = 16;

// Cargo por servicio en centavos. El frontend usa la misma formula
// (src/lib/fees.ts) con el porcentaje que le da GET /payments/fees, para que
// el desglose que ve el alumno sea exactamente lo que se cobra.
function serviceFeeCents(classCents, fees) {
  return Math.round((classCents * fees.serviceFeePercent) / 100);
}

// Lo que Stripe se queda de un cargo por `amountCents` (el total cobrado),
// con su IVA. Se redondea en dos pasos, como Stripe: primero la comision y
// luego el IVA sobre ella.
function stripeFeeCents(amountCents) {
  const fee = Math.round((amountCents * STRIPE_PERCENT) / 100) + STRIPE_FIXED_CENTS;
  return fee + Math.round((fee * STRIPE_FEE_IVA_PERCENT) / 100);
}

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

  // La cuenta es del dueño y la comparten sus sucursales: lo que se sepa
  // aqui se guarda en todas, para que el catalogo (`stripe_ready`) deje de
  // publicar las que no pueden cobrar, o vuelva a publicarlas.
  if (!account) {
    await pool.query(
      `UPDATE studios SET stripe_account_id = NULL, stripe_ready = FALSE
        WHERE stripe_account_id = $1`,
      [stripeAccountId],
    );
    return false;
  }

  const ready = account.capabilities?.transfers === "active";
  await pool.query(
    "UPDATE studios SET stripe_ready = $2 WHERE stripe_account_id = $1",
    [stripeAccountId, ready],
  );
  return ready;
}

// Reparto de un cobro, con P = precio (clase o paquete) y T = P + 3% de P.
// `fees` sale de getFees(); se pide aparte para que la ruta lo lea una vez:
//
//   alumno paga       T
//   Stripe se queda   (3.6% de T + $3) + 16% de IVA sobre eso
//   Wellco se queda   3% de P (del alumno) + 1.5% de P (del estudio)
//   estudio recibe    P - 1.5% de P - lo de Stripe
//
// La comision de Stripe se resta de la transferencia porque Stripe la cobra
// de la cuenta de la plataforma, no de la del estudio: sin restarla aqui,
// saldria del bolsillo de Wellco.
function splitCharge(baseCents, fees) {
  const serviceFee = serviceFeeCents(baseCents, fees);
  const amountCents = baseCents + serviceFee;
  const studioCommission = Math.round((baseCents * fees.commissionPercent) / 100);
  const stripeFee = stripeFeeCents(amountCents);
  return {
    serviceFee,
    amountCents,
    studioCommission,
    stripeFee,
    studioAmount: baseCents - studioCommission - stripeFee,
  };
}

// Metadata del PaymentIntent: el desglose queda en Stripe para conciliar.
function splitMetadata(baseCents, split) {
  return {
    precio_centavos: String(baseCents),
    cargo_servicio_centavos: String(split.serviceFee),
    comision_estudio_centavos: String(split.studioCommission),
    comision_stripe_centavos: String(split.stripeFee),
    estudio_centavos: String(split.studioAmount),
  };
}

// Tarjeta guardada del alumno: { customerId, paymentMethodId } o null.
async function savedCard(userId) {
  const customerId = await getCustomerId(userId);
  if (!customerId) return null;
  const paymentMethods = await stripe.paymentMethods.list({
    customer: customerId,
    type: "card",
  });
  if (paymentMethods.data.length === 0) return null;
  return { customerId, paymentMethodId: paymentMethods.data[0].id };
}

// ------------------------------------------------------------ 3D Secure
//
// Las clases y los paquetes se cobran a la tarjeta guardada sin el alumno
// presente (`off_session`). Si su banco pide 3D Secure, ese cobro no puede
// pasar: hay que confirmarlo en el navegador. Entonces:
//
//   1. chargeSavedCard intenta el cobro normal. Si el banco pide
//      autenticacion, crea un PaymentIntent que SOLO AUTORIZA
//      (`capture_method: "manual"`) y lanza NeedsAuthentication. La ruta hace
//      ROLLBACK, asi que no queda reserva ni compra.
//   2. El frontend abre la ventana del banco (src/lib/sca.ts) y repite la
//      MISMA peticion con `paymentIntentId`.
//   3. La ruta vuelve a validar todo (lugar, duplicados, precio) y
//      chargeSavedCard, en vez de cobrar otra vez, comprueba que esa
//      autorizacion sea de este alumno, por este monto y para esto mismo, y la
//      captura dentro de la transaccion.
//
// Se autoriza y no se cobra de una vez porque entre la ventana del banco y la
// reserva pueden pasar cosas (se llena la clase, cierran la pestaña). Lo que
// nunca se captura, Stripe lo libera solo a los 7 dias; si la ruta lo descarta
// antes, releaseAuthorization lo libera al momento.

class NeedsAuthentication extends Error {
  constructor(paymentIntent) {
    super("El banco pide 3D Secure");
    this.clientSecret = paymentIntent.client_secret;
    this.paymentIntentId = paymentIntent.id;
  }
}

/** Respuesta para el frontend cuando hay que pasar por el banco. */
function authenticationResponse(res, err) {
  return res.status(402).json({
    requires_action: true,
    clientSecret: err.clientSecret,
    paymentIntentId: err.paymentIntentId,
    error: "Tu banco pide confirmar el pago.",
  });
}

/** Mensaje para el alumno cuando Stripe rechaza la tarjeta. */
function cardErrorResponse(res, err) {
  return res.status(402).json({
    error:
      err.code === "authentication_required"
        ? "Tu banco pidió confirmar el pago y no se pudo. Prueba con otra tarjeta."
        : "Tu tarjeta fue rechazada. Prueba con otra.",
  });
}

/**
 * Cobra `split` a la tarjeta guardada con la parte del estudio para
 * `destination`.
 *
 * `metadata` identifica lo que se paga (tipo, clase y fecha, paquete...). Va
 * en el PaymentIntent y, en la segunda vuelta, se compara campo por campo:
 * una autorizacion de una clase de $150 no puede pagar un paquete de $500.
 * `extraMetadata` es lo que solo existe dentro de la transaccion (el id de la
 * compra) y se agrega al final, sin compararse.
 */
async function chargeSavedCard({
  userId,
  card,
  split,
  destination,
  metadata,
  extraMetadata = {},
  paymentIntentId = null,
}) {
  const expected = { ...metadata, user_id: String(userId) };

  if (paymentIntentId) {
    const pi = await stripe.paymentIntents
      .retrieve(String(paymentIntentId))
      .catch((err) => {
        if (resourceMissing(err)) return null;
        throw err;
      });
    const matches =
      pi &&
      pi.status === "requires_capture" &&
      pi.amount === split.amountCents &&
      pi.currency === "mxn" &&
      pi.transfer_data?.destination === destination &&
      pi.transfer_data?.amount === split.studioAmount &&
      Object.entries(expected).every(([k, v]) => pi.metadata?.[k] === v);
    if (!matches) {
      const err = new Error("Autorizacion de pago invalida");
      err.status = 409;
      err.publicMessage =
        "El pago confirmado no corresponde a esta reserva. Inténtalo de nuevo.";
      throw err;
    }
    const captured = await stripe.paymentIntents.capture(pi.id);
    if (Object.keys(extraMetadata).length > 0) {
      await stripe.paymentIntents
        .update(pi.id, { metadata: extraMetadata })
        .catch((err) => console.error("No se anoto la metadata", pi.id, err));
    }
    return captured;
  }

  const base = {
    amount: split.amountCents,
    currency: "mxn",
    customer: card.customerId,
    payment_method: card.paymentMethodId,
    transfer_data: { destination, amount: split.studioAmount },
  };

  try {
    return await stripe.paymentIntents.create({
      ...base,
      confirm: true,
      off_session: true,
      metadata: { ...expected, ...extraMetadata },
    });
  } catch (err) {
    if (err.type !== "StripeCardError" || err.code !== "authentication_required") {
      throw err;
    }
    // El intento fallido no sirve para nada mas; se cancela para que no se
    // quede colgado en el dashboard como "requiere metodo de pago".
    const failed = err.raw?.payment_intent?.id;
    if (failed) await stripe.paymentIntents.cancel(failed).catch(() => {});

    const pi = await stripe.paymentIntents.create({
      ...base,
      capture_method: "manual",
      payment_method_types: ["card"],
      metadata: expected,
    });
    throw new NeedsAuthentication(pi);
  }
}

/**
 * Suelta una autorizacion que la ruta no llego a capturar (la clase se lleno,
 * ya tenia reserva...). Solo la del propio alumno y solo si sigue sin
 * capturar: nunca cancela un cobro hecho.
 */
async function releaseAuthorization(paymentIntentId, userId) {
  if (!paymentIntentId) return;
  try {
    const pi = await stripe.paymentIntents.retrieve(String(paymentIntentId));
    if (pi.status === "requires_capture" && pi.metadata?.user_id === String(userId)) {
      await stripe.paymentIntents.cancel(pi.id);
    }
  } catch (err) {
    if (!resourceMissing(err)) console.error("No se libero la autorizacion", err);
  }
}

/**
 * Lo que comparten las tres rutas de cobro al fallar: 3D Secure, tarjeta
 * rechazada o una autorizacion que no corresponde. Devuelve true si respondio.
 */
function respondChargeError(res, err) {
  if (err instanceof NeedsAuthentication) {
    authenticationResponse(res, err);
    return true;
  }
  if (err.type === "StripeCardError") {
    cardErrorResponse(res, err);
    return true;
  }
  if (err.publicMessage) {
    res.status(err.status || 400).json({ error: err.publicMessage });
    return true;
  }
  return false;
}

module.exports = {
  chargeSavedCard,
  releaseAuthorization,
  respondChargeError,
  NeedsAuthentication,
  getFees,
  invalidateFees,
  serviceFeeCents,
  stripeFeeCents,
  splitCharge,
  splitMetadata,
  getCustomerId,
  studioCanReceive,
  savedCard,
};
