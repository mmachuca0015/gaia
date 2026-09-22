// Que pasa con los alumnos cuando las sucursales de un dueño dejan de operar.
//
// Son dos caminos y la diferencia es si le queda alguna sucursal:
//
//   BAJAR DE PLAN (queda al menos una). Nadie pierde dinero, se mueve: las
//   clases sueltas que el alumno ya pago en las sucursales que se duermen se
//   le abonan GRATIS en la que sobrevive, y las que habia sacado de un paquete
//   se le regresan al paquete, que de todas formas ya se canjea alli
//   (PURCHASE_COVERS_STUDIO en packages.js).
//
//   CANCELAR (no queda ninguna). No hay a donde moverlo, asi que se le
//   devuelve el dinero, y lo pone el estudio.
//
// Las dos corren desde el webhook, cuando el cambio de veras entra, no cuando
// el dueño lo confirma: hasta el ultimo dia pagado las clases se dan normal.
const pool = require("../db");
const { stripe } = require("./stripe");
const { studioWithinPlan } = require("./catalog");
const { TODAY_MX } = require("./packages");
const { splitCharge } = require("./charges");
const {
  sendClosureCredit,
  sendClosureRefund,
  sendNoFundsReport,
} = require("./closureEmail");

// Cuanto dura un abono por cierre. No hereda el vencimiento de la reserva
// original (una clase de la semana que viene no da tiempo a nada): se le da
// medio año para usarlo, que es mas que cualquier paquete que se vende.
const CREDIT_MONTHS = 6;

// Reservas vivas que todavia no se dan, de las sucursales de un dueño. Son las
// que hay que resolver cuando algo cierra.
//
// `package_purchase_id` distingue las dos formas de haber llegado a esa clase:
// con tarjeta (se abona o se devuelve) o gastando una clase de un paquete (se
// le regresa al paquete).
const AFFECTED_BOOKINGS = `
  SELECT b.id, b.user_id, b.package_purchase_id,
         to_char(b.class_date, 'YYYY-MM-DD') AS class_date,
         b.stripe_payment_intent_id, b.price_cents, b.service_fee_cents,
         cl.name AS class_name, cl.id AS class_id,
         studios.id AS studio_id, studios.name AS studio_name,
         studios.branch_name,
         u.email, u.name AS user_name
    FROM bookings b
    JOIN schedules sch ON sch.id = b.schedule_id
    JOIN classes   cl  ON cl.id  = sch.class_id
    JOIN studios       ON studios.id = cl.studio_id
    JOIN users     u   ON u.id = b.user_id
   WHERE studios.owner_id = $1
     AND studios.deleted_at IS NULL
     AND b.status = 'activa'
     AND b.class_date >= ${TODAY_MX}`;

// Compras de paquete con clases sin canjear y todavia vigentes. Los abonos por
// cierre (package_id NULL) no entran: no se pago nada por ellos.
const AFFECTED_PURCHASES = `
  SELECT pp.id, pp.user_id, pp.name, pp.classes_total, pp.classes_used,
         pp.price_cents, pp.stripe_payment_intent_id,
         to_char(pp.expires_at AT TIME ZONE 'America/Mexico_City', 'YYYY-MM-DD')
           AS expires_at,
         studios.id AS studio_id, studios.name AS studio_name,
         u.email, u.name AS user_name
    FROM package_purchases pp
    JOIN studios ON studios.id = pp.studio_id
    JOIN users u ON u.id = pp.user_id
   WHERE studios.owner_id = $1
     AND studios.deleted_at IS NULL
     AND pp.package_id IS NOT NULL
     AND pp.classes_used < pp.classes_total
     AND (pp.expires_at AT TIME ZONE 'America/Mexico_City')::date >= ${TODAY_MX}`;

/** Las sucursales del dueño separadas en las que siguen y las que no. */
async function splitBranches(ownerId, db = pool) {
  const { rows } = await db.query(
    `SELECT studios.id, studios.name, studios.branch_name,
            ${studioWithinPlan()} AS within_plan
       FROM studios
      WHERE studios.owner_id = $1 AND studios.deleted_at IS NULL
      ORDER BY studios.created_at, studios.id`,
    [ownerId],
  );
  return {
    surviving: rows.filter((b) => b.within_plan),
    closing: rows.filter((b) => !b.within_plan),
  };
}

const branchName = (b) => b.branch_name?.trim() || b.name;

/**
 * BAJAR DE PLAN. Mueve a los alumnos de las sucursales dormidas a la que
 * sobrevive, sin cobrarles ni devolverles nada.
 *
 * Todo en una transaccion: si algo truena, ninguna reserva queda cancelada sin
 * su abono. Los correos van al final, fuera de la transaccion, porque un
 * correo que no sale no debe deshacer un abono que si se dio.
 */
async function relocateStudents(ownerId) {
  const { surviving, closing } = await splitBranches(ownerId);
  if (closing.length === 0 || surviving.length === 0) return { credits: [] };

  // La que sobrevive: la primera, la que nacio con la cuenta. Es la misma que
  // elige el catalogo, asi que el abono cae donde el alumno si puede reservar.
  const destino = surviving[0];
  const closingIds = closing.map((b) => b.id);

  const client = await pool.connect();
  const avisos = [];
  try {
    await client.query("BEGIN");

    const { rows: afectadas } = await client.query(
      `${AFFECTED_BOOKINGS} AND studios.id = ANY($2::int[]) FOR UPDATE OF b`,
      [ownerId, closingIds],
    );
    if (afectadas.length === 0) {
      await client.query("ROLLBACK");
      return { credits: [] };
    }

    // Las que salieron de un paquete: se le regresa la clase al paquete. No se
    // abona nada, porque el paquete mismo ya se canjea en la que sobrevive.
    for (const reserva of afectadas.filter((b) => b.package_purchase_id)) {
      await client.query(
        `UPDATE package_purchases
            SET classes_used = GREATEST(classes_used - 1, 0)
          WHERE id = $1`,
        [reserva.package_purchase_id],
      );
    }

    // Las pagadas con tarjeta: UN abono por clase, no una bolsa.
    //
    // Uno por clase y no uno de N porque cada abono guarda lo que el alumno
    // pago por ESA clase, y con eso se calcula la diferencia si canjea una mas
    // cara. En una bolsa el valor seria un promedio, y con clases de precios
    // distintos le saldria mal la cuenta a alguien.
    const conTarjeta = afectadas.filter((b) => !b.package_purchase_id);
    for (const reserva of conTarjeta) {
      const cerrada = closing.find((b) => b.id === reserva.studio_id);
      await client.query(
        `INSERT INTO package_purchases
           (package_id, user_id, studio_id, origin_studio_id, name,
            classes_total, classes_used, any_class, permanent_only,
            price_cents, service_fee_cents, amount_cents, expires_at)
         VALUES (NULL, $1, $2, $3, $4, 1, 0, TRUE, FALSE, $5, 0, 0,
                 NOW() + make_interval(months => $6))`,
        [
          reserva.user_id,
          destino.id,
          reserva.studio_id,
          reserva.class_name,
          reserva.price_cents ?? 0,
          CREDIT_MONTHS,
        ],
      );
      const llave = `${reserva.user_id}:${reserva.studio_id}`;
      let aviso = avisos.find((a) => a.llave === llave);
      if (!aviso) {
        // El correo si va junto: uno por alumno y sucursal, no uno por clase.
        aviso = {
          llave,
          email: reserva.email,
          userName: reserva.user_name,
          closedBranch: branchName(cerrada),
          newBranch: branchName(destino),
          classes: [],
        };
        avisos.push(aviso);
      }
      aviso.classes.push({ name: reserva.class_name, date: reserva.class_date });
    }

    // 'reubicada', no 'cancelada': la clase no se da, pero el estudio se queda
    // con el dinero porque el alumno recibio otra a cambio. Si se marcara como
    // devuelta, el ingreso desapareceria del panel del dueño.
    await client.query(
      `UPDATE bookings SET status = 'reubicada' WHERE id = ANY($1::int[])`,
      [afectadas.map((b) => b.id)],
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  for (const aviso of avisos) await sendClosureCredit(aviso);
  return { credits: avisos };
}

// Escribe en la bitacora de devoluciones.
//
// El UNIQUE de `refunds` es lo que impide devolver dos veces cuando Stripe
// reintenta el mismo webhook: si ya hay renglon, el INSERT no hace nada y esto
// devuelve null, que es la señal de "ya estaba resuelto, no lo cuentes".
async function anotar({
  kind, id, userId, studioId, cents, stripeFee, status, refundId, error,
}) {
  const columna = kind === "reserva" ? "booking_id" : "purchase_id";
  const { rows } = await pool.query(
    `INSERT INTO refunds (kind, ${columna}, user_id, studio_id, amount_cents,
                          stripe_fee_cents, stripe_refund_id, status, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [kind, id, userId, studioId, cents, stripeFee ?? 0,
     refundId ?? null, status, error ?? null],
  );
  return rows[0] ? { status, cents, stripeFee: stripeFee ?? 0 } : null;
}

/**
 * Devuelve lo que se pueda de un cargo y anota el resultado.
 *
 * El alumno recibe el PRECIO de la clase, o la parte del paquete que no uso.
 * NO se le devuelve el 3% del cargo por servicio: eso lo cobro Wellco por
 * sostener la plataforma y la baja no fue decision suya.
 *
 * `reverse_transfer` le saca el dinero a la cuenta del estudio en vez de al
 * bolsillo de Wellco. Es lo mas importante de esta funcion: sin eso, cada
 * estudio que cierra le cuesta dinero a Wellco.
 */
async function refundOne({
  kind, id, userId, studioId, paymentIntentId, cents, stripeFee,
}) {
  if (cents <= 0) return null;
  const base = { kind, id, userId, studioId, cents, stripeFee };

  // Reservas de antes de la migracion 015: no se sabe con que cargo se
  // pagaron. No se inventa nada, se anota para el Excel del admin.
  if (!paymentIntentId) return anotar({ ...base, status: "sin_cargo" });

  try {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: cents,
      reverse_transfer: true,
      metadata: { motivo: "cierre_de_estudio", tipo: kind },
    });
    return anotar({ ...base, status: "hecho", refundId: refund.id });
  } catch (err) {
    // El caso que importa: la cuenta del estudio no tiene con que. Se anota y
    // sale en el Excel; no se reintenta a ciegas ni Wellco paga por el.
    return anotar({ ...base, status: "sin_fondos", error: err.message });
  }
}

/**
 * Lo que Stripe se quedo del cobro original y NO devuelve.
 *
 * Hoy lo absorbe Wellco: al alumno se le regresa el precio de la clase, pero
 * de la cuenta del estudio solo se puede recuperar lo que recibio, que ya
 * venia sin esta comision. Se anota en cada renglon de `refunds` y sale en el
 * Excel del admin para poder medir cuanto es.
 *
 * Sale de `splitCharge`, el mismo reparto con el que se cobro, no de una
 * formula escrita aparte. En un paquete devuelto a medias se prorratea igual
 * que el dinero.
 */
function stripeFeeOf(baseCents, proporcion = 1) {
  if (baseCents <= 0) return 0;
  return Math.round(splitCharge(baseCents).stripeFee * proporcion);
}

/**
 * Parte del paquete que no se uso, en centavos.
 *
 * Se divide el precio entre las clases que traia y se devuelven las que
 * quedan: 0 de 4 usadas devuelve todo, 2 de 4 devuelve la mitad. El cargo por
 * servicio no entra, igual que en una clase suelta.
 */
function unusedPackageCents(purchase) {
  if (purchase.classes_total <= 0) return 0;
  const quedan = purchase.classes_total - purchase.classes_used;
  return Math.round((purchase.price_cents * quedan) / purchase.classes_total);
}

/**
 * CANCELAR. No sobrevive ninguna sucursal: se le devuelve su dinero a todo el
 * que tenga clases pagadas sin tomar.
 *
 * Lo que no se pudo devolver (cargos viejos sin referencia, cuenta sin saldo)
 * no se pierde de vista: se junta y se le manda al admin en un Excel para
 * cobrarlo a mano.
 */
async function refundStudents(ownerId) {
  const { rows: reservas } = await pool.query(AFFECTED_BOOKINGS, [ownerId]);
  const { rows: compras } = await pool.query(AFFECTED_PURCHASES, [ownerId]);

  const pendientes = [];
  const devueltos = [];
  const reembolsadas = [];

  for (const r of reservas) {
    // Una clase sacada de un paquete no se devuelve aqui: su dinero esta en la
    // compra del paquete y se devuelve alla. Devolver las dos seria pagar dos
    // veces la misma clase.
    if (r.package_purchase_id) continue;
    const res = await refundOne({
      kind: "reserva",
      id: r.id,
      userId: r.user_id,
      studioId: r.studio_id,
      paymentIntentId: r.stripe_payment_intent_id,
      cents: r.price_cents ?? 0,
      stripeFee: stripeFeeOf(r.price_cents ?? 0),
    });
    if (!res) continue;
    reembolsadas.push(r.id);
    const fila = {
      email: r.email,
      userName: r.user_name,
      tipo: "Clase reservada",
      nombre: r.class_name,
      centavos: r.price_cents ?? 0,
      comisionStripe: res.stripeFee,
      estudio: r.studio_name,
      fecha: r.class_date,
      referencia: r.class_id,
    };
    (res.status === "hecho" ? devueltos : pendientes).push(fila);
  }

  for (const c of compras) {
    const cents = unusedPackageCents(c);
    // La comision de Stripe fue sobre el paquete entero; de una devolucion
    // parcial toca la parte proporcional.
    const sinUsar = (c.classes_total - c.classes_used) / c.classes_total;
    const res = await refundOne({
      kind: "paquete",
      id: c.id,
      userId: c.user_id,
      studioId: c.studio_id,
      paymentIntentId: c.stripe_payment_intent_id,
      cents,
      stripeFee: stripeFeeOf(c.price_cents, sinUsar),
    });
    if (!res) continue;
    const fila = {
      email: c.email,
      userName: c.user_name,
      tipo: "Paquete",
      nombre: `${c.name} (${c.classes_total - c.classes_used} de ${c.classes_total} sin usar)`,
      centavos: cents,
      comisionStripe: res.stripeFee,
      estudio: c.studio_name,
      fecha: c.expires_at,
      referencia: c.id,
    };
    (res.status === "hecho" ? devueltos : pendientes).push(fila);
  }

  // Una reserva devuelta deja de contar como ingreso del estudio: ese dinero
  // ya no es suyo. Por eso 'reembolsada' y no 'reubicada'.
  if (reembolsadas.length > 0) {
    await pool.query(
      `UPDATE bookings SET status = 'reembolsada'
        WHERE id = ANY($1::int[]) AND status = 'activa'`,
      [reembolsadas],
    );
  }

  for (const fila of devueltos) await sendClosureRefund(fila);

  if (pendientes.length > 0) {
    const { rows } = await pool.query(
      `SELECT name FROM studios WHERE owner_id = $1 AND deleted_at IS NULL
        ORDER BY created_at LIMIT 1`,
      [ownerId],
    );
    await sendNoFundsReport(rows[0]?.name ?? `Estudio ${ownerId}`, pendientes);
  }

  return { devueltos: devueltos.length, pendientes: pendientes.length };
}

module.exports = {
  relocateStudents,
  refundStudents,
  unusedPackageCents,
  stripeFeeOf,
  splitBranches,
  CREDIT_MONTHS,
};
