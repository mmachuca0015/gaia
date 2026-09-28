const express = require("express");
const router = express.Router();
const pool = require("../db");
const {
  REVENUE_ROWS,
  localTime,
  NOW_MX,
  periodOf,
} = require("../services/revenue");
const { stripe } = require("../services/stripe");
const { requireAuth, requireRole } = require("../middleware/auth");
const {
  annualSql,
  loadOwnerSubscription,
  PLAN_FOR_STRIPE,
  setStripePlan,
} = require("../services/subscriptionPlan");
const { sleepingImpact } = require("../services/planImpact");
const { relocateStudents } = require("../services/closure");
const { sendPlanChange } = require("../services/planChangeEmail");
const { getFees, invalidateFees } = require("../services/charges");

// Lo que Wellco cobro en cada cargo, separado en sus dos lados: el cargo por
// servicio que paga el alumno y la comision que se le descuenta al estudio.
// Una fila por cargo, en centavos.
//
// Sale de lo que se guardo al cobrar (`service_fee_cents`, `commission_cents`),
// no de los porcentajes de hoy: si cambian, lo ya cobrado no se mueve. Las
// reservas anteriores a la migracion 015 no guardaron el 3% y se estima con
// el precio de hoy de la clase (antes la cuota era fija de $3, asi que es
// aproximado); su comision la lleno la migracion 021.
//
//   - Reserva con tarjeta: su precio y su 3%.
//   - Reserva con paquete: solo si se cobro diferencia (un abono que canjea
//     una clase mas cara); si no, guarda 0 y el paquete ya se conto al venderse.
//   - 'reembolsada': el 3% se queda (se devuelve el precio, no el total) pero
//     la comision no, porque el estudio devolvio la clase entera.
//   - Compra de paquete: su precio y su 3%. Los abonos (package_id NULL) no
//     son venta.
const FEE_ROWS = `(
  SELECT b.created_at,
         COALESCE(b.service_fee_cents,
                  -- Estimado fijo en 3%, no el de fee_settings: si el
                  -- porcentaje cambia, estas reservas viejas no se mueven.
                  CASE WHEN b.package_purchase_id IS NULL
                       THEN ROUND(classes.price * 3) END,
                  0) AS service_fee_cents,
         CASE WHEN b.status = 'reembolsada' THEN 0
              ELSE COALESCE(b.commission_cents, 0)
         END AS commission_cents
  FROM bookings b
  JOIN schedules ON schedules.id = b.schedule_id
  JOIN classes   ON classes.id = schedules.class_id
  JOIN studios   ON studios.id = classes.studio_id
  WHERE b.status IN ('activa', 'pasada', 'reubicada', 'reembolsada')
    AND NOT studios.is_demo

  UNION ALL

  SELECT pp.created_at, pp.service_fee_cents,
         COALESCE(pp.commission_cents, 0)
  FROM package_purchases pp
  JOIN studios ON studios.id = pp.studio_id
  WHERE pp.package_id IS NOT NULL
    AND NOT studios.is_demo
) AS fees`;

// Todo el panel de administracion exige sesion con rol admin. Antes estas
// rutas eran publicas: cualquiera podia listar usuarios y estudios.
router.use(requireAuth, requireRole("admin"));

// --------------------------------------------------------------- comisiones

// Porcentaje escrito por el admin -> puntos base. Hasta dos decimales (1.25%)
// y entre 0 y 20%: mas que eso es un dedazo, no una decision de negocio.
function toBasisPoints(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 20) return null;
  const bp = Math.round(n * 100);
  if (Math.abs(bp - n * 100) > 1e-6) return null;
  return bp;
}

router.get("/fees", async (req, res) => {
  try {
    const fees = await getFees();
    res.json({
      service_fee_percent: fees.serviceFeePercent,
      commission_percent: fees.commissionPercent,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No pudimos leer las comisiones" });
  }
});

// Cambia los porcentajes. Aplica desde el siguiente cobro: lo ya cobrado
// guardo su propio cargo y comision (migraciones 015 y 021) y no se mueve.
// En Stripe no hay nada que actualizar: el reparto se calcula en cada
// PaymentIntent (transfer_data.amount), no vive configurado alla.
router.put("/fees", async (req, res) => {
  const serviceBp = toBasisPoints(req.body?.service_fee_percent);
  const commissionBp = toBasisPoints(req.body?.commission_percent);
  if (serviceBp === null || commissionBp === null) {
    return res.status(400).json({
      error: "Los porcentajes deben ir de 0 a 20, con hasta dos decimales",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT service_fee_bp, commission_bp FROM fee_settings WHERE id = 1 FOR UPDATE",
    );
    const before = rows[0];
    if (
      before.service_fee_bp === serviceBp &&
      before.commission_bp === commissionBp
    ) {
      await client.query("ROLLBACK");
      return res.json({ unchanged: true });
    }
    await client.query(
      `UPDATE fee_settings
          SET service_fee_bp = $1, commission_bp = $2, updated_at = NOW()
        WHERE id = 1`,
      [serviceBp, commissionBp],
    );
    await client.query(
      `INSERT INTO fee_changes
         (admin_id, from_service_fee_bp, to_service_fee_bp,
          from_commission_bp, to_commission_bp)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.id, before.service_fee_bp, serviceBp, before.commission_bp, commissionBp],
    );
    await client.query("COMMIT");
    invalidateFees();
    res.json({
      service_fee_percent: serviceBp / 100,
      commission_percent: commissionBp / 100,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "No pudimos guardar las comisiones" });
  } finally {
    client.release();
  }
});

// Métricas generales
router.get("/metrics", async (req, res) => {
  try {
    // Cobros de clases y de paquetes (services/revenue.js). Los estudios demo
    // no mueven dinero: no cuentan en metricas.
    const transactions = await pool.query(
      `SELECT COUNT(*) AS total, SUM(amount) AS total_amount
       FROM ${REVENUE_ROWS} WHERE NOT is_demo`,
    );

    // Ingreso de Wellco por cobro: el cargo por servicio del alumno mas la
    // comision del estudio, con lo que se guardo en cada cobro (FEE_ROWS). Ya
    // no es el total por un porcentaje: si cambia, lo pasado no se mueve.
    const pilaCommission = await pool.query(
      `SELECT (COALESCE(SUM(service_fee_cents), 0)
               + COALESCE(SUM(commission_cents), 0)) / 100.0 AS commission,
              COALESCE(SUM(service_fee_cents), 0) / 100.0 AS service_fee,
              COALESCE(SUM(commission_cents), 0) / 100.0 AS studio_commission
       FROM ${FEE_ROWS}`,
    );

    // Lo que gano Wellco hoy (hora de Mexico): cargo por servicio del alumno,
    // comision del estudio y suscripciones SIN IVA, que no es ingreso.
    const todayStart = `date_trunc('day', ${NOW_MX})`;
    const today = await pool.query(
      `SELECT
         (SELECT COALESCE(SUM(service_fee_cents), 0) FROM ${FEE_ROWS}
           WHERE ${localTime("fees.created_at")} >= ${todayStart}) / 100.0 AS service_fee,
         (SELECT COALESCE(SUM(commission_cents), 0) FROM ${FEE_ROWS}
           WHERE ${localTime("fees.created_at")} >= ${todayStart}) / 100.0 AS studio_commission,
         (SELECT COALESCE(SUM(net_cents), 0) FROM subscription_payments sp
           WHERE ${localTime("sp.paid_at")} >= ${todayStart}) / 100.0 AS subscriptions`,
    );

    // Altas del mes en curso, desde el dia 1 en hora de Mexico: con la base
    // en UTC, el mes empezaria a las 6 de la tarde del ultimo dia del anterior.
    const monthStart = `date_trunc('month', ${NOW_MX})`;

    const newStudios = await pool.query(
      `SELECT COUNT(*) AS total FROM studios
       WHERE ${localTime("created_at")} >= ${monthStart}`,
    );

    const newUsers = await pool.query(
      `SELECT COUNT(*) AS total FROM users
       WHERE ${localTime("created_at")} >= ${monthStart}`,
    );

    res.json({
      transactions: transactions.rows[0],
      commission: pilaCommission.rows[0],
      today: today.rows[0],
      newStudios: newStudios.rows[0],
      newUsers: newUsers.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener métricas" });
  }
});

router.get("/charts", async (req, res) => {
  const period = periodOf(req.query.period);

  try {
    // Un punto por hora, dia o mes del periodo, AUNQUE no haya nada que
    // contar: generate_series arma todos los puntos y los LEFT JOIN los
    // llenan. Sin eso, un periodo sin movimiento devolvia una lista vacia y
    // la grafica quedaba en blanco. Mismo arreglo que /studios/:id/ingresos-grafica.
    //
    // Los periodos son los del panel del dueño (PERIODS, hora de Mexico): con
    // la base en UTC, "hoy" empezaba a las 6 de la tarde del dia anterior.
    const result = await pool.query(`
      WITH buckets AS (
        SELECT generate_series(${period.start}, ${period.end},
                               INTERVAL '${period.step}') AS bucket
      ),
      dinero AS (
        SELECT date_trunc('${period.unit}', ${localTime("money.created_at")}) AS bucket,
               COUNT(*) AS total, SUM(amount) AS amount
        FROM ${REVENUE_ROWS}
        WHERE NOT money.is_demo
          AND ${localTime("money.created_at")} >= ${period.start}
        GROUP BY 1
      ),
      cargos AS (
        SELECT date_trunc('${period.unit}', ${localTime("fees.created_at")}) AS bucket,
               SUM(service_fee_cents) AS servicio,
               SUM(commission_cents) AS comision
        FROM ${FEE_ROWS}
        WHERE ${localTime("fees.created_at")} >= ${period.start}
        GROUP BY 1
      ),
      -- Sin IVA: el IVA se le debe al SAT, no es ingreso de Wellco.
      suscripciones AS (
        SELECT date_trunc('${period.unit}', ${localTime("sp.paid_at")}) AS bucket,
               SUM(sp.net_cents) AS neto
        FROM subscription_payments sp
        WHERE ${localTime("sp.paid_at")} >= ${period.start}
        GROUP BY 1
      ),
      nuevos_usuarios AS (
        SELECT date_trunc('${period.unit}', ${localTime("users.created_at")}) AS bucket,
               COUNT(*) AS total
        FROM users
        WHERE ${localTime("users.created_at")} >= ${period.start}
        GROUP BY 1
      ),
      nuevos_estudios AS (
        SELECT date_trunc('${period.unit}', ${localTime("studios.created_at")}) AS bucket,
               COUNT(*) AS total
        FROM studios
        WHERE ${localTime("studios.created_at")} >= ${period.start}
        GROUP BY 1
      )
      SELECT to_char(b.bucket, 'YYYY-MM-DD"T"HH24:MI') AS periodo,
             COALESCE(d.total, 0) AS transacciones,
             COALESCE(d.amount, 0) AS monto,
             COALESCE(c.servicio, 0) / 100.0 AS cargo_servicio,
             COALESCE(c.comision, 0) / 100.0 AS comision_estudio,
             COALESCE(s.neto, 0) / 100.0 AS suscripciones,
             COALESCE(u.total, 0) AS usuarios,
             COALESCE(e.total, 0) AS estudios
      FROM buckets b
      LEFT JOIN dinero d ON d.bucket = b.bucket
      LEFT JOIN cargos c ON c.bucket = b.bucket
      LEFT JOIN suscripciones s ON s.bucket = b.bucket
      LEFT JOIN nuevos_usuarios u ON u.bucket = b.bucket
      LEFT JOIN nuevos_estudios e ON e.bucket = b.bucket
      ORDER BY b.bucket
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener datos de gráficas" });
  }
});

// Clases pagadas: una fila por clase Y FECHA (no por horario), con la lista de
// alumnos que la pagaron. Un horario permanente se da cada semana, asi que la
// llave de una clase dada es (schedule_id, fecha), que es justo lo que guarda
// cada reserva.
const CLASES_PAGADAS_PAGE = 25;

// Como ordenar segun lo que se pide: lo proximo de la fecha mas cercana en
// adelante, lo pasado de lo mas reciente hacia atras.
const CLASES_ORDER = {
  proximas: "ASC",
  pasadas: "DESC",
  todas: "DESC",
};

// La fecha de la clase. Las reservas viejas tienen `class_date` en NULL
// (es anterior a ellas); para un horario de una sola vez la fecha es la del
// horario, y para uno permanente ya no hay forma de saberla.
const FECHA_CLASE = "COALESCE(bookings.class_date, schedules.date)";

// "Ya paso" se decide con la fecha y la hora de la clase, no con el estado de
// la reserva: el cron que las marca 'pasada' corre cada hora, asi que entre la
// clase y el cron el estado todavia dice 'activa'. Solo cuando no hay fecha
// (las reservas viejas) se cae al estado, que es lo unico que queda.
const YA_PASO = `CASE
      WHEN fecha IS NULL THEN alguna_pasada
      ELSE (fecha + time) < ${NOW_MX}
    END`;

router.get("/clases-pagadas", async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const offset = (page - 1) * CLASES_PAGADAS_PAGE;

  const cuando = CLASES_ORDER[req.query.cuando] ? req.query.cuando : "todas";
  const dir = CLASES_ORDER[cuando];
  const cuandoFilter =
    cuando === "proximas"
      ? `AND NOT (${YA_PASO})`
      : cuando === "pasadas"
        ? `AND (${YA_PASO})`
        : "";

  // El buscador entra como %texto%; vacio significa "no filtres".
  const q = (req.query.q || "").trim();
  const search = q ? `%${q}%` : "";

  try {
    // Los alumnos vienen agregados en la misma consulta (json_agg) en vez de
    // una consulta por clase: son 25 clases por pagina y serian 25 viajes.
    //
    // COUNT(*) OVER () cuenta las clases que pasan el filtro ANTES del LIMIT,
    // asi que el total de la paginacion sale de la misma consulta.
    const result = await pool.query(
      `
      WITH ocurrencias AS (
        SELECT
          bookings.schedule_id,
          ${FECHA_CLASE} AS fecha,
          classes.id AS class_id,
          classes.name AS class_name,
          classes.price,
          classes.capacity,
          studios.id AS studio_id,
          studios.name AS studio_name,
          studios.is_demo,
          schedules.time,
          schedules.end_time,
          COUNT(*) AS alumnos_total,
          bool_or(bookings.status = 'pasada') AS alguna_pasada,
          -- Lo que dejo esa fecha en caja: solo las reservas con su propio
          -- cargo. Las de paquete no suman aqui, se cobraron al comprarlo
          -- (misma regla que REVENUE_ROWS). Sale NULL, no cero, cuando
          -- ninguna reserva guardo el monto: son anteriores a la migracion
          -- 015 y cero diria que la clase fue gratis.
          SUM(bookings.price_cents)
            FILTER (WHERE bookings.package_purchase_id IS NULL) AS cobrado_cents,
          json_agg(
            json_build_object(
              'booking_id', bookings.id,
              'user_id', users.id,
              'name', users.name,
              'last_name', users.last_name,
              'email', users.email,
              'con_paquete', bookings.package_purchase_id IS NOT NULL,
              'package_name', package_purchases.name,
              'price_cents', bookings.price_cents,
              'service_fee_cents', bookings.service_fee_cents,
              'reservada_el', to_char(
                ${localTime("bookings.created_at")}, 'YYYY-MM-DD"T"HH24:MI')
            )
            ORDER BY users.name, users.last_name, users.id
          ) AS alumnos,
          -- Para el buscador: el nombre y el correo de todos los alumnos de
          -- esa clase en un solo texto. Se filtra sobre el grupo y no sobre
          -- la reserva para que buscar a una persona devuelva sus clases con
          -- la lista completa, no nada mas su renglon.
          string_agg(
            users.name || ' ' || users.last_name || ' ' || users.email, ' '
          ) AS busqueda
        FROM bookings
        JOIN schedules ON schedules.id = bookings.schedule_id
        JOIN classes   ON classes.id = schedules.class_id
        JOIN studios   ON studios.id = classes.studio_id
        JOIN users     ON users.id = bookings.user_id
        LEFT JOIN package_purchases
          ON package_purchases.id = bookings.package_purchase_id
        -- 'reubicada' y 'reembolsada' quedan fuera: esa clase no se dio o se
        -- devolvio el dinero.
        WHERE bookings.status IN ('activa', 'pasada')
        GROUP BY bookings.schedule_id, ${FECHA_CLASE}, classes.id,
                 studios.id, schedules.time, schedules.end_time
      )
      SELECT
        schedule_id,
        class_id,
        class_name,
        price,
        capacity,
        studio_id,
        studio_name,
        is_demo,
        alumnos_total,
        cobrado_cents,
        alumnos,
        -- La fecha es un DATE: como texto no se corre un dia al convertirla
        -- a Date con el servidor en UTC.
        to_char(fecha, 'YYYY-MM-DD') AS class_date,
        to_char(time, 'HH24:MI') AS time,
        to_char(end_time, 'HH24:MI') AS end_time,
        ${YA_PASO} AS ya_paso,
        COUNT(*) OVER () AS total
      FROM ocurrencias
      WHERE ($1 = ''
         OR busqueda ILIKE $1
         OR class_name ILIKE $1
         OR studio_name ILIKE $1)
        ${cuandoFilter}
      -- Las reservas viejas no tienen fecha; van al final en vez de encabezar
      -- la lista, que es donde las pone Postgres al ordenar DESC.
      ORDER BY fecha ${dir} NULLS LAST, time ${dir} NULLS LAST, class_id
      LIMIT $2 OFFSET $3
      `,
      [search, CLASES_PAGADAS_PAGE, offset],
    );

    // El total viaja repetido en cada fila; sin filas no hay ninguno.
    const total = result.rows.length ? Number(result.rows[0].total) : 0;

    res.json({
      clases: result.rows,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / CLASES_PAGADAS_PAGE)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener las clases pagadas" });
  }
});

// --------------------------------------------------- pagos de suscripciones

// Cuantos cobros trae cada pagina. Cada uno cuesta una consulta mas a Stripe
// para saber con que tarjeta se pago, asi que la pagina no crece de mas.
const PAGOS_PAGE = 25;

// Por que se cobro, en español. Stripe manda la razon en ingles.
const RAZON_COBRO = {
  subscription_create: "Alta",
  subscription_cycle: "Renovación",
  subscription_update: "Ajuste",
  subscription_threshold: "Ajuste",
  manual: "Manual",
};

// De que plan habla la linea de una factura cuando su Price ya no esta en la
// base. Stripe la escribe como "1 x Wellco Pro (at $1,099.00 / month)", que
// en una tabla se lee mal; nos quedamos con el nombre.
function nombreDeLinea(linea) {
  const texto = linea?.description;
  if (!texto) return null;
  return texto
    .replace(/^\s*\d+\s*[x×]\s*/i, "")
    .replace(/\s*\(at .*\)\s*$/i, "")
    .trim();
}

function intervaloDeLinea(linea) {
  const texto = linea?.description ?? "";
  if (/\/\s*year/i.test(texto)) return "año";
  if (/\/\s*month/i.test(texto)) return "mes";
  return null;
}

// El cobro que cerro una factura. Una factura puede tener varios intentos
// (una tarjeta rechazada y luego otra); el que importa es el que quedo pagado.
function pagoDeFactura(invoice) {
  const intentos = invoice.payments?.data ?? [];
  const pagado = intentos.find((p) => p.status === "paid") ?? intentos[0];
  const pi = pagado?.payment?.payment_intent;
  return typeof pi === "string" ? pi : (pi?.id ?? null);
}

// La tarjeta con la que se pago cada factura, por PaymentIntent.
//
// No se puede pedir en la misma llamada: expandir hasta el cargo serian cinco
// niveles y Stripe permite cuatro. Son 25 consultas en paralelo, una por
// cobro de la pagina. Si alguna falla se deja sin tarjeta: es un dato de
// apoyo y vale mas la lista completa sin el que un error.
async function tarjetasDe(invoices) {
  const ids = [...new Set(invoices.map(pagoDeFactura).filter(Boolean))];
  const tarjetas = new Map();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const pi = await stripe.paymentIntents.retrieve(id, {
          expand: ["latest_charge"],
        });
        const card = pi.latest_charge?.payment_method_details?.card;
        if (card) tarjetas.set(id, { brand: card.brand, last4: card.last4 });
      } catch (err) {
        console.error("Sin tarjeta para", id, err.message);
      }
    }),
  );
  return tarjetas;
}

// Cuando se cobro de verdad. `created` es cuando se emitio la factura, que
// en una renovacion puede ser antes del cobro.
function cobradoEn(factura) {
  return factura.status_transitions?.paid_at ?? factura.created;
}

// Cuantos estudios como maximo abarca una busqueda. Cada uno es una consulta
// mas a Stripe, asi que buscar "a" no puede disparar doscientas.
const MAX_CLIENTES_BUSQUEDA = 20;

// A que clientes de Stripe corresponde lo que se busco. Stripe no sabe buscar
// por nombre de estudio ni por correo, asi que la busqueda se resuelve en
// nuestra base y a Stripe solo se le piden los cobros de esos clientes.
async function clientesQueCoinciden(texto) {
  const { rows } = await pool.query(
    `SELECT DISTINCT subscriptions.stripe_customer_id
     FROM subscriptions
     JOIN studio_owners ON studio_owners.id = subscriptions.owner_id
     -- Cualquiera de sus sucursales sirve para encontrarlo: la suscripcion
     -- es del dueño, pero el admin la busca por el estudio que conoce.
     LEFT JOIN studios ON studios.owner_id = studio_owners.id
     WHERE subscriptions.stripe_customer_id IS NOT NULL
       AND (studio_owners.email ILIKE $1
            OR (studio_owners.name || ' ' || studio_owners.last_name) ILIKE $1
            OR studios.name ILIKE $1
            OR studios.email ILIKE $1)
     LIMIT $2`,
    [texto, MAX_CLIENTES_BUSQUEDA + 1],
  );
  const ids = rows.map((row) => row.stripe_customer_id);
  return {
    ids: ids.slice(0, MAX_CLIENTES_BUSQUEDA),
    truncado: ids.length > MAX_CLIENTES_BUSQUEDA,
  };
}

// Los cobros de unos cuantos clientes, juntos y del mas nuevo al mas viejo.
// Un estudio no llega a 100 recibos en años, asi que con una pagina de Stripe
// por cliente se tiene su historia completa y se puede paginar en memoria.
async function facturasDeClientes(ids) {
  const listas = await Promise.all(
    ids.map((customer) =>
      stripe.invoices
        .list({ customer, status: "paid", limit: 100, expand: ["data.payments"] })
        .then((lista) => lista.data)
        .catch((err) => {
          console.error("Sin facturas de", customer, err.message);
          return [];
        }),
    ),
  );
  return listas.flat().sort((a, b) => cobradoEn(b) - cobradoEn(a));
}

router.get("/pagos-suscripciones", async (req, res) => {
  // Stripe pagina con cursor, no con numero de pagina: el cursor es el id de
  // la ultima factura que se entrego. Buscando no hay cursor que valga (las
  // facturas vienen de varios clientes y se juntan aqui), asi que esa sale
  // por numero de pagina.
  const after = typeof req.query.after === "string" ? req.query.after : null;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const q = (req.query.q || "").trim();

  try {
    // Las facturas salen de Stripe y no de nuestra base: ahi esta el historico
    // completo de cobros y es el unico lugar donde vive la tarjeta. Las unicas
    // facturas de la cuenta son las de suscripcion; las clases y los paquetes
    // se cobran con PaymentIntents sueltos, sin factura.
    let facturas = [];
    let hasMore = false;
    let next = null;
    let truncado = false;

    if (q) {
      const { ids, truncado: sobran } = await clientesQueCoinciden(`%${q}%`);
      truncado = sobran;
      const todas = ids.length ? await facturasDeClientes(ids) : [];
      const desde = (page - 1) * PAGOS_PAGE;
      facturas = todas.slice(desde, desde + PAGOS_PAGE);
      hasMore = todas.length > desde + PAGOS_PAGE;
    } else {
      const lista = await stripe.invoices.list({
        status: "paid",
        limit: PAGOS_PAGE,
        expand: ["data.payments"],
        ...(after ? { starting_after: after } : {}),
      });
      facturas = lista.data;
      hasMore = lista.has_more;
      next = hasMore ? (facturas[facturas.length - 1]?.id ?? null) : null;
    }

    // De quien es cada cobro: el cliente de Stripe esta en la suscripcion, y
    // de ahi se llega al dueño y a su estudio. Un dueño puede tener varias
    // sucursales; la que lo representa es la primera, la que nacio con la
    // cuenta, que es el mismo criterio del resto del panel.
    const clientes = [
      ...new Set(facturas.map((f) => f.customer).filter(Boolean)),
    ];
    const { rows: duenos } = clientes.length
      ? await pool.query(
          `SELECT
             subscriptions.stripe_customer_id,
             studio_owners.id AS owner_id,
             studio_owners.name,
             studio_owners.last_name,
             studio_owners.email,
             estudio.id AS studio_id,
             estudio.name AS studio_name,
             (SELECT COUNT(*) FROM studios
               WHERE studios.owner_id = studio_owners.id) AS sucursales
           FROM subscriptions
           JOIN studio_owners ON studio_owners.id = subscriptions.owner_id
           LEFT JOIN LATERAL (
             SELECT studios.id, studios.name
             FROM studios
             WHERE studios.owner_id = studio_owners.id
             ORDER BY studios.created_at ASC, studios.id ASC
             LIMIT 1
           ) AS estudio ON true
           WHERE subscriptions.stripe_customer_id = ANY($1)`,
          [clientes],
        )
      : { rows: [] };
    const porCliente = new Map(
      duenos.map((row) => [row.stripe_customer_id, row]),
    );

    // Que plan se cobro: sale del Price de la factura, no del plan que tiene
    // hoy la suscripcion. Si cambio de plan, el recibo viejo tiene que seguir
    // diciendo lo que se pago entonces.
    const { rows: planes } = await pool.query(
      `SELECT name, stripe_price_id, stripe_price_id_year FROM plans`,
    );
    // El intervalo sale de CUAL de los dos Prices del plan se cobro, que es
    // un dato nuestro. En la API 2026-04 la linea de la factura ya no trae
    // `price.recurring`, asi que preguntarselo a Stripe devolvia siempre null.
    const porPrice = new Map();
    for (const plan of planes) {
      if (plan.stripe_price_id) {
        porPrice.set(plan.stripe_price_id, { name: plan.name, intervalo: "mes" });
      }
      if (plan.stripe_price_id_year) {
        porPrice.set(plan.stripe_price_id_year, { name: plan.name, intervalo: "año" });
      }
    }

    // Las tarjetas se piden solo para la pagina que se va a enseñar.
    const tarjetas = await tarjetasDe(facturas);

    const pagos = facturas.map((factura) => {
      const linea = factura.lines?.data?.[0];
      const priceId =
        linea?.price?.id ?? linea?.pricing?.price_details?.price ?? null;
      const dueno = porCliente.get(factura.customer) ?? null;
      const tarjeta = tarjetas.get(pagoDeFactura(factura)) ?? null;
      const delPlan = priceId ? porPrice.get(priceId) : null;

      return {
        invoice_id: factura.id,
        pagado_en: cobradoEn(factura),
        // Lo que se le cobro a la tarjeta: el plan MAS el IVA, que Stripe
        // agrega como Tax Rate y por eso no esta en `price_cents`.
        amount_cents: factura.amount_paid,
        currency: (factura.currency || "mxn").toUpperCase(),
        razon: RAZON_COBRO[factura.billing_reason] ?? "Cobro",
        // El plan de la base; si el Price ya no existe ahi (uno viejo, que
        // Stripe no deja modificar y por eso se reemplaza), lo que diga la
        // factura, que es como Stripe se lo enseño al dueño.
        plan_name: delPlan?.name ?? nombreDeLinea(linea),
        intervalo: delPlan?.intervalo ?? intervaloDeLinea(linea),
        owner_id: dueno?.owner_id ?? null,
        owner_name: dueno ? `${dueno.name} ${dueno.last_name}` : null,
        email: dueno?.email ?? factura.customer_email ?? null,
        studio_id: dueno?.studio_id ?? null,
        studio_name: dueno?.studio_name ?? null,
        sucursales: dueno ? Number(dueno.sucursales) : 0,
        card_brand: tarjeta?.brand ?? null,
        card_last4: tarjeta?.last4 ?? null,
      };
    });

    res.json({
      pagos,
      has_more: hasMore,
      // Con que seguir cuando no se esta buscando: el id de la ultima
      // factura de esta pagina.
      next,
      page,
      // La busqueda encontro mas estudios de los que cabe revisar: se le
      // avisa para que acote, en vez de enseñar una lista incompleta como
      // si fuera toda.
      truncado,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener los pagos" });
  }
});

router.get("/users", async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 25;
  const offset = (page - 1) * limit;
  // El buscador entra como %texto%; vacio significa "no filtres".
  const q = (req.query.q || "").trim();
  const search = q ? `%${q}%` : "";

  try {
    // Los usuarios guardan su ubicación en country/state (no hay columna city).
    // Los dueños no tienen ubicación propia: se toma la de su estudio más antiguo.
    const result = await pool.query(
      `WITH todos AS (
         SELECT
           users.id,
           users.name,
           users.last_name,
           users.email,
           'user'::text AS role,
           users.country,
           NULLIF(users.state, '') AS city,
           users.created_at,
           users.is_demo
         FROM users
         UNION ALL
         SELECT
           studio_owners.id,
           studio_owners.name,
           studio_owners.last_name,
           studio_owners.email,
           'owner'::text AS role,
           estudio.country,
           COALESCE(NULLIF(estudio.city, ''), NULLIF(estudio.state, '')) AS city,
           studio_owners.created_at,
           -- Un dueño es demo por su estudio; se marca en la lista de estudios.
           COALESCE(estudio.is_demo, FALSE) AS is_demo
         FROM studio_owners
         LEFT JOIN LATERAL (
           SELECT studios.country, studios.city, studios.state, studios.is_demo
           FROM studios
           WHERE studios.owner_id = studio_owners.id
           ORDER BY studios.created_at ASC
           LIMIT 1
         ) AS estudio ON true
       )
       SELECT *, COUNT(*) OVER () AS total
       FROM todos
       -- El nombre completo tambien se compara junto: se busca "Ana Ruiz",
       -- no "Ana" y "Ruiz" por separado.
       WHERE $3 = ''
          OR name ILIKE $3
          OR last_name ILIKE $3
          OR (name || ' ' || last_name) ILIKE $3
          OR email ILIKE $3
       ORDER BY created_at DESC, id ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset, search],
    );

    // El total sale de la misma consulta (COUNT(*) OVER () cuenta antes del
    // LIMIT): con un buscador, un conteo aparte diria cuantos hay en total y
    // no cuantos encontro.
    const total = result.rows.length ? Number(result.rows[0].total) : 0;

    res.json({
      users: result.rows,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener usuarios" });
  }
});

router.get("/studios", async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;
  // El buscador entra como %texto%; vacio significa "no filtres".
  const q = (req.query.q || "").trim();
  const search = q ? `%${q}%` : "";

  try {
    const result = await pool.query(
      `SELECT
         studios.id,
         studio_owners.name,
         studio_owners.last_name,
         studios.name AS studio_name,
         studios.email,
         studios.country,
         COALESCE(NULLIF(studios.city, ''), studios.state) AS city,
         -- El plan de verdad. Antes esta columna era el texto fijo 'Sin plan'
         -- para todos, asi que la tabla no servia ni para ver quien pagaba
         -- que. Un dueño sin fila es heredado: se registro antes de que
         -- existieran los planes.
         plans.name AS plan,
         subs.status AS subscription_status,
         studios.is_demo,
         COUNT(*) OVER () AS total
       FROM studios
       JOIN studio_owners ON studio_owners.id = studios.owner_id
       LEFT JOIN subscriptions subs ON subs.owner_id = studios.owner_id
       LEFT JOIN plans ON plans.id = subs.plan_id
       -- Busca por el estudio y tambien por su dueño: el admin llega tanto
       -- por el nombre del lugar como por la persona con la que hablo.
       WHERE $3 = ''
          OR studios.name ILIKE $3
          OR studios.email ILIKE $3
          OR studio_owners.email ILIKE $3
          OR (studio_owners.name || ' ' || studio_owners.last_name) ILIKE $3
          OR studios.city ILIKE $3
          OR studios.state ILIKE $3
       ORDER BY studios.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset, search],
    );

    // El total sale de la misma consulta (COUNT(*) OVER () cuenta antes del
    // LIMIT): con un buscador, un conteo aparte diria cuantos hay en total y
    // no cuantos encontro.
    const total = result.rows.length ? Number(result.rows[0].total) : 0;

    res.json({
      studios: result.rows,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener estudios" });
  }
});

// Marca o desmarca una cuenta demo. Un estudio demo sale del catalogo publico
// y solo lo ven los usuarios demo; sus reservas con usuarios demo no se cobran.
async function setDemo(table, req, res) {
  if (typeof req.body.is_demo !== "boolean") {
    return res.status(400).json({ error: "is_demo debe ser true o false" });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE ${table} SET is_demo = $1 WHERE id = $2 RETURNING id, is_demo`,
      [req.body.is_demo, req.params.id],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "No encontrado" });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo actualizar la cuenta demo" });
  }
}

router.patch("/studios/:id/demo", (req, res) => setDemo("studios", req, res));
router.patch("/users/:id/demo", (req, res) => setDemo("users", req, res));

router.get("/studios/:id/details", async (req, res) => {
  const { id } = req.params;
  try {
    const studio = await pool.query("SELECT * FROM studios WHERE id = $1", [
      id,
    ]);

    if (studio.rows.length === 0) {
      return res.status(404).json({ error: "Estudio no encontrado" });
    }

    const classes = await pool.query(
      `
      SELECT
        classes.id,
        classes.name,
        classes.price,
        classes.capacity,
        COALESCE(instructors.name || ' ' || instructors.last_name, classes.instructor) AS instructor,
        COUNT(DISTINCT bookings.id) AS alumnos,
        COALESCE(
          JSONB_AGG(DISTINCT JSONB_BUILD_OBJECT('day', schedules.day, 'time', schedules.time))
            FILTER (WHERE schedules.id IS NOT NULL),
          '[]'::jsonb
        ) AS horarios
      FROM classes
      LEFT JOIN schedules ON schedules.class_id = classes.id
      LEFT JOIN instructors ON classes.instructor_id = instructors.id
      LEFT JOIN bookings ON bookings.schedule_id = schedules.id AND bookings.status = 'activa'
      WHERE classes.studio_id = $1
      GROUP BY classes.id, instructors.name, instructors.last_name
      ORDER BY classes.name ASC
    `,
      [id],
    );

    const instructors = await pool.query(
      `SELECT id, name, last_name, created_at
       FROM instructors
       WHERE studio_id = $1
       ORDER BY created_at ASC`,
      [id],
    );

    res.json({
      studio: studio.rows[0],
      classes: classes.rows,
      instructors: instructors.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener detalles" });
  }
});
// router.get("/studios/:id", async (req, res) => {
//   const { id } = req.params;

//   try {
//     const studioResult = await pool.query(
//       `SELECT
//          studios.*,
//          studio_owners.name AS owner_name,
//          studio_owners.last_name AS owner_last_name,
//          studio_owners.email AS owner_email
//        FROM studios
//        JOIN studio_owners ON studio_owners.id = studios.owner_id
//        WHERE studios.id = $1`,
//       [id],
//     );

//     if (studioResult.rows.length === 0) {
//       return res.status(404).json({ error: "Estudio no encontrado" });
//     }

//     const studio = studioResult.rows[0];

//     const ownerStudiosResult = await pool.query(
//       "SELECT COUNT(*) AS total FROM studios WHERE owner_id = $1",
//       [studio.owner_id],
//     );

//     const instructorsResult = await pool.query(
//       `SELECT
//          instructors.id,
//          instructors.name,
//          instructors.last_name,
//          instructors.created_at,
//          COUNT(DISTINCT classes.id) AS class_count,
//          COALESCE(
//            array_agg(DISTINCT classes.name) FILTER (WHERE classes.name IS NOT NULL),
//            ARRAY[]::text[]
//          ) AS classes
//        FROM instructors
//        LEFT JOIN classes ON classes.instructor_id = instructors.id
//        WHERE instructors.studio_id = $1
//        GROUP BY instructors.id
//        ORDER BY instructors.created_at ASC`,
//       [id],
//     );

//     const classesResult = await pool.query(
//       `SELECT
//          classes.id,
//          classes.name,
//          classes.capacity,
//          classes.price,
//          COALESCE(
//            instructors.name || ' ' || instructors.last_name,
//            classes.instructor
//          ) AS instructor_name
//        FROM classes
//        LEFT JOIN instructors ON classes.instructor_id = instructors.id
//        WHERE classes.studio_id = $1
//        ORDER BY classes.name ASC`,
//       [id],
//     );

//     res.json({
//       studio,
//       ownerStudiosCount: parseInt(ownerStudiosResult.rows[0].total, 10),
//       instructors: instructorsResult.rows,
//       classes: classesResult.rows,
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "Error al obtener detalle del estudio" });
//   }
// });

// --- Cambio de plan desde el admin -----------------------------------------
//
// Lo hace soporte, no el dueño: para ayudar a un estudio o arreglarle una
// situacion. Por eso pasa por las MISMAS funciones que el cambio del dueño
// (services/subscriptionPlan.js) y queda anotado en `admin_plan_changes`.

// Los planes como los necesita el pop up, con sus caracteristicas.
const PLANS_FOR_ADMIN = `
  SELECT p.id, p.name, p.price_cents, p.currency, p.max_studios, p.notices,
         p.is_active, ${annualSql("p")} AS annual_price_cents,
         COALESCE(
           (SELECT json_agg(f.label ORDER BY f.sort_order, f.id)
              FROM plan_features f WHERE f.plan_id = p.id),
           '[]'::json) AS features
  FROM plans p
  WHERE p.is_active = TRUE
  ORDER BY p.sort_order, p.id`;

// Quien es el dueño de este estudio y si su cuenta se puede tocar.
async function studioOwner(studioId) {
  const { rows } = await pool.query(
    `SELECT studios.id, studios.name AS studio_name, studios.is_demo,
            studio_owners.id AS owner_id, studio_owners.name AS owner_name,
            studio_owners.last_name, studio_owners.email
       FROM studios
       JOIN studio_owners ON studio_owners.id = studios.owner_id
      WHERE studios.id = $1 AND studios.deleted_at IS NULL`,
    [studioId],
  );
  return rows[0] ?? null;
}

/**
 * Por que NO se puede cambiar el plan de esta cuenta. null = si se puede.
 *
 * Es una funcion y no un `if` dentro de la ruta porque la pantalla necesita
 * saberlo ANTES (para no ofrecer el cambio) y la ruta tiene que volver a
 * comprobarlo al guardar.
 */
function blockedReason(studio, sub) {
  // Una cuenta demo no tiene suscripcion de verdad: cambiarle el plan seria
  // tocar Stripe con una cuenta que nunca cobra.
  if (studio.is_demo) {
    return "Es una cuenta demo: no tiene suscripción que cambiar";
  }
  if (!sub || sub.is_demo) {
    return sub
      ? "Es una cuenta demo: no tiene suscripción que cambiar"
      : "Este estudio no tiene suscripción (se registró antes de los planes)";
  }
  if (sub.status !== "activa") {
    return `Su suscripción está ${sub.status}: solo se puede cambiar una activa`;
  }
  // Activa pero sin suscripcion en Stripe: nunca cerro el cobro. No hay nada
  // que mover alla, y la pantalla tiene que decir eso y no "esta activa".
  if (!sub.stripe_subscription_id) {
    return "Su suscripción no está conectada con Stripe: no completó el pago";
  }
  if (sub.cancel_at_period_end) {
    return "Su suscripción está programada para terminar; primero hay que reanudarla";
  }
  return null;
}

// Fecha del proximo cobro, en hora de Mexico y como texto: un DATE convertido
// a Date por pg se corre un dia con el servidor en UTC.
async function nextChargeDate(subscriptionId) {
  const { rows } = await pool.query(
    `SELECT to_char(current_period_end AT TIME ZONE 'America/Mexico_City', 'YYYY-MM-DD') AS fecha
       FROM subscriptions WHERE id = $1`,
    [subscriptionId],
  );
  return rows[0]?.fecha ?? null;
}

// Todo lo que el pop up necesita. Con `?plan_id=` agrega a quien le pega ese
// plan: las sucursales que se dormirian, con sus reservaciones y sus clases de
// paquete sin canjear. Los numeros los cuenta el backend, igual que en el
// cambio de plan del dueño: estimarlos en el cliente seria enseñar cifras que
// no son.
router.get("/studios/:id/plan", async (req, res) => {
  try {
    const studio = await studioOwner(req.params.id);
    if (!studio) return res.status(404).json({ error: "Estudio no encontrado" });

    const sub = await loadOwnerSubscription(studio.owner_id);
    const { rows: plans } = await pool.query(PLANS_FOR_ADMIN);

    let impact = null;
    const planId = Number(req.query.plan_id);
    if (planId) {
      const target = plans.find((p) => p.id === planId);
      if (target) {
        impact = {
          max_studios: target.max_studios,
          branches: await sleepingImpact(studio.owner_id, target.max_studios),
        };
      }
    }

    res.json({
      studio: {
        id: studio.id,
        name: studio.studio_name,
        is_demo: studio.is_demo,
      },
      owner: {
        name: `${studio.owner_name} ${studio.last_name}`.trim(),
        email: studio.email,
      },
      subscription: sub
        ? {
            status: sub.status,
            plan_id: sub.plan_id,
            plan_name: sub.plan_name,
            price_cents: sub.price_cents,
            billing_interval: sub.billing_interval,
            current_period_end: sub.current_period_end,
            cancel_at_period_end: sub.cancel_at_period_end,
            pending_plan_id: sub.pending_plan_id,
            pending_plan_name: sub.pending_plan_name,
          }
        : null,
      blocked: blockedReason(studio, sub),
      plans,
      impact,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener el plan del estudio" });
  }
});

router.post("/studios/:id/plan", async (req, res) => {
  const when = req.body.when;
  if (when !== "now" && when !== "period_end") {
    return res.status(400).json({ error: "Elige cuándo se aplica el cambio" });
  }

  try {
    const studio = await studioOwner(req.params.id);
    if (!studio) return res.status(404).json({ error: "Estudio no encontrado" });

    const sub = await loadOwnerSubscription(studio.owner_id);
    // Se vuelve a comprobar aqui y no solo en la pantalla: el pop up puede
    // llevar minutos abierto y la cuenta pudo cambiar mientras tanto.
    const blocked = blockedReason(studio, sub);
    if (blocked) return res.status(409).json({ error: blocked });

    const planId = Number(req.body.plan_id);
    const { rows } = await pool.query(
      `${PLAN_FOR_STRIPE} AND is_active = TRUE`,
      [planId],
    );
    const target = rows[0];
    if (!target) {
      return res
        .status(400)
        .json({ error: "El plan seleccionado no está disponible" });
    }
    // Volver al plan que ya tiene solo sirve para cancelar un cambio
    // programado; si no hay ninguno, no hay nada que hacer.
    const backToCurrent = target.id === sub.plan_id;
    if (backToCurrent && !sub.pending_plan_id) {
      return res.status(400).json({ error: "El estudio ya tiene ese plan" });
    }

    // A quien le pega. Las sucursales que no caben en el plan nuevo se duermen
    // (salen del catalogo y el dueño ya no las administra) y sus alumnos se
    // reubican. El admin tiene que reconocerlo, igual que el dueño.
    const afectadas = backToCurrent
      ? []
      : await sleepingImpact(studio.owner_id, target.max_studios);
    if (afectadas.length > 0 && req.body.confirm_branches !== true) {
      return res.status(409).json({
        error:
          afectadas.length === 1
            ? "Con este plan una de sus sucursales deja de aparecer en el catálogo. Confirma que lo sabes."
            : `Con este plan ${afectadas.length} de sus sucursales dejan de aparecer en el catálogo. Confirma que lo sabes.`,
        code: "sucursales_dormidas",
        branches: afectadas,
      });
    }

    const inmediato = when === "now";
    const nextCharge = await nextChargeDate(sub.subscription_id);

    if (inmediato) {
      // El plan cambia YA. Stripe abona lo que no se usó del anterior y cobra
      // lo que queda del nuevo; la diferencia sale en el siguiente recibo, sin
      // tocar la tarjeta en este momento (ver setStripePlan).
      await setStripePlan(sub, target, "create_prorations");
      await pool.query(
        `UPDATE subscriptions
            SET plan_id = $1, pending_plan_id = NULL, updated_at = NOW()
          WHERE id = $2`,
        [target.id, sub.subscription_id],
      );
      // Las sucursales se duermen en el momento en que cambia el plan, asi que
      // los alumnos se mueven aqui y no en el webhook: si no, quedarian con
      // reservas en una sucursal que ya no le aparece a nadie.
      if (afectadas.length > 0) {
        await relocateStudents(studio.owner_id).catch((err) =>
          console.error("No se pudo reubicar a los alumnos:", err),
        );
      }
    } else {
      // Programado: el periodo que ya pagó se respeta completo y el precio
      // nuevo entra en la renovación. `plan_id` solo lo mueve el webhook, con
      // el invoice.paid del siguiente ciclo.
      await setStripePlan(sub, target, "none");
      await pool.query(
        `UPDATE subscriptions SET pending_plan_id = $1, updated_at = NOW()
          WHERE id = $2`,
        [backToCurrent ? null : target.id, sub.subscription_id],
      );
    }

    // Queda anotado quién lo hizo. Va después del cambio: si el INSERT falla,
    // se anota en el log y no se tira un cambio que Stripe ya aplicó.
    await pool
      .query(
        `INSERT INTO admin_plan_changes
           (admin_id, owner_id, from_plan_id, to_plan_id, applies, note)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          req.user.id,
          studio.owner_id,
          sub.plan_id,
          target.id,
          inmediato ? "inmediato" : "fin_de_periodo",
          String(req.body.note ?? "")
            .trim()
            .slice(0, 500) || null,
        ],
      )
      .catch((err) => console.error("No se anotó el cambio de plan:", err));

    // El correo va al final y nunca truena: el cambio ya se aplicó, y un
    // correo que no sale no debe hacer que el admin lo intente otra vez.
    // Volver al plan actual no manda nada: no cambió de plan, se canceló un
    // cambio que todavía no entraba.
    if (!backToCurrent) {
      const { rows: conFeatures } = await pool.query(PLANS_FOR_ADMIN);
      const plan = conFeatures.find((p) => p.id === target.id) ?? target;
      await sendPlanChange({
        email: studio.email,
        ownerName: studio.owner_name,
        studioName: studio.studio_name,
        plan,
        amountCents:
          sub.billing_interval === "year"
            ? plan.annual_price_cents
            : plan.price_cents,
        interval: sub.billing_interval,
        immediate: inmediato,
        appliesOn: nextCharge,
        nextChargeOn: nextCharge,
      });
    }

    res.json({
      success: true,
      applies: inmediato ? "inmediato" : "fin_de_periodo",
      next_charge: nextCharge,
      emailed: backToCurrent ? null : studio.email,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No pudimos cambiar el plan del estudio" });
  }
});

module.exports = router;

