// Dinero de las reservas y los paquetes: cuanto paga el alumno, cuanto se
// queda cada quien y con que tarjeta se cobra. Lo usan /payments/charge
// (una clase) y la compra de paquetes, para que los dos cobren igual.
const pool = require("../db");
const { stripe, resourceMissing } = require("./stripe");

// Wellco cobra por dos lados, los dos en porcentaje sobre el PRECIO de la
// clase (o del paquete), no sobre el total:
//
//   - Cargo por servicio: 3% que paga el alumno ENCIMA del precio.
//   - Comision: 1.5% que se le descuenta al estudio.
//
// El estudio ademas absorbe la comision completa de Stripe (3.6% del total
// cobrado + $3 fijos). El alumno ya no paga los $3.
const SERVICE_FEE_PERCENT = 3;
const COMMISSION_PERCENT = 1.5;

// Lo que cobra Stripe en Mexico por un cargo con tarjeta nacional. Solo se usa
// para restarlo de la transferencia al estudio: Stripe lo descuenta de la
// cuenta de la plataforma, no de la del estudio. La comision real varia con la
// tarjeta (internacional, AmEx), asi que el neto de Wellco es aproximado.
const STRIPE_PERCENT = 3.6;
const STRIPE_FIXED_CENTS = 300;

// Cargo por servicio en centavos. El frontend usa la misma formula
// (src/lib/fees.ts) con el porcentaje que le da GET /payments/fees, para que
// el desglose que ve el alumno sea exactamente lo que se cobra.
function serviceFeeCents(classCents) {
  return Math.round((classCents * SERVICE_FEE_PERCENT) / 100);
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

  if (!account) {
    await pool.query(
      "UPDATE studios SET stripe_account_id = NULL WHERE id = $1",
      [studioId],
    );
    return false;
  }

  return account.capabilities?.transfers === "active";
}

// Reparto de un cobro, con P = precio (clase o paquete) y T = P + 3% de P:
//
//   alumno paga       T
//   Stripe se queda   3.6% de T + $3
//   Wellco se queda   3% de P (del alumno) + 1.5% de P (del estudio)
//   estudio recibe    P - 1.5% de P - (3.6% de T + $3)
//
// La comision de Stripe se resta de la transferencia porque Stripe la cobra
// de la cuenta de la plataforma, no de la del estudio: sin restarla aqui,
// saldria del bolsillo de Wellco.
function splitCharge(baseCents) {
  const serviceFee = serviceFeeCents(baseCents);
  const amountCents = baseCents + serviceFee;
  const studioCommission = Math.round((baseCents * COMMISSION_PERCENT) / 100);
  const stripeFee =
    Math.round((amountCents * STRIPE_PERCENT) / 100) + STRIPE_FIXED_CENTS;
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

module.exports = {
  SERVICE_FEE_PERCENT,
  serviceFeeCents,
  splitCharge,
  splitMetadata,
  getCustomerId,
  studioCanReceive,
  savedCard,
};
