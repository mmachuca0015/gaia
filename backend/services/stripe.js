// Cliente unico de Stripe y utilidades del corte a produccion.
//
// Antes cada router hacia su propio require("stripe")(...). Con una sola
// instancia hay un solo lugar donde mirar la configuracion, y sobre todo un
// solo lugar donde vive `resourceMissing`, que es la pieza que hace posible
// cambiar de modo prueba a modo live sin que se caiga la app.
const Stripe = require("stripe");

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  throw new Error("Falta STRIPE_SECRET_KEY");
}

const stripe = Stripe(secretKey);

const isLiveKey = secretKey.startsWith("sk_live_") || secretKey.startsWith("rk_live_");

// Un desajuste entre el modo de la llave y el entorno no rompe nada al
// arrancar, pero se ve igual que todo funcionando: en produccion con llave de
// prueba los cobros se ven exitosos y no mueven un peso. Por eso se grita en
// los logs, que es donde se va a mirar cuando algo no cuadre.
if (process.env.NODE_ENV === "production" && !isLiveKey) {
  console.error(
    "AVISO: NODE_ENV=production con una llave de Stripe de PRUEBA. " +
      "Los cobros no seran reales.",
  );
}
if (process.env.NODE_ENV !== "production" && isLiveKey) {
  console.error(
    "AVISO: llave de Stripe LIVE fuera de produccion. " +
      "Cualquier cobro de prueba movera dinero real.",
  );
}

// ¿El error es "ese objeto no existe en esta cuenta"?
//
// Es el error que devuelve Stripe cuando se le pasa un id creado en el otro
// modo: los `cus_`, `acct_`, `prod_` de prueba no existen en live y viceversa.
// No hay forma de distinguirlos por el texto del id, asi que la unica manera
// honesta de saberlo es preguntarle a Stripe y reconocer esta respuesta.
//
// Se trata como "hay que crearlo de nuevo", nunca como un fallo del servidor.
function resourceMissing(err) {
  return (
    err?.type === "StripeInvalidRequestError" &&
    (err.code === "resource_missing" || err.statusCode === 404)
  );
}

module.exports = { stripe, resourceMissing, isLiveKey };
