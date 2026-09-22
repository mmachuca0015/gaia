const express = require("express");
const router = express.Router();
const pool = require("../db");
const { REVENUE_ROWS } = require("../services/revenue");
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

// Todo el panel de administracion exige sesion con rol admin. Antes estas
// rutas eran publicas: cualquiera podia listar usuarios y estudios.
router.use(requireAuth, requireRole("admin"));

// Métricas generales
router.get("/metrics", async (req, res) => {
  try {
    // Cobros de clases y de paquetes (services/revenue.js). Los estudios demo
    // no mueven dinero: no cuentan en metricas.
    const transactions = await pool.query(
      `SELECT COUNT(*) AS total, SUM(amount) AS total_amount
       FROM ${REVENUE_ROWS} WHERE NOT is_demo`,
    );

    // Ingreso de Wellco por cobro: 3% que paga el alumno + 1.5% del estudio,
    // los dos sobre el precio (ver services/charges.js).
    const pilaCommission = await pool.query(
      `SELECT SUM(amount * 0.045) AS commission
       FROM ${REVENUE_ROWS} WHERE NOT is_demo`,
    );

    const newStudios = await pool.query(
      "SELECT COUNT(*) AS total FROM studios WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'",
    );

    const newUsers = await pool.query(
      "SELECT COUNT(*) AS total FROM users WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'",
    );

    res.json({
      transactions: transactions.rows[0],
      commission: pilaCommission.rows[0],
      newStudios: newStudios.rows[0],
      newUsers: newUsers.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener métricas" });
  }
});

function buildGroupBy(column, period) {
  if (period === "semana") {
    return `DATE(${column})`;
  }
  if (period === "mes") {
    return `DATE_TRUNC('week', ${column})`;
  }
  if (period === "semestral") {
    return `DATE_TRUNC('month', ${column})`;
  }
  return `EXTRACT(HOUR FROM ${column})`;
}

function buildDateFilter(period) {
  if (period === "semana") return "INTERVAL '7 days'";
  if (period === "mes") return "INTERVAL '1 month'";
  if (period === "semestral") return "INTERVAL '6 months'";
  return "INTERVAL '1 day'";
}

router.get("/charts", async (req, res) => {
  const { period } = req.query;
  const dateFilter = buildDateFilter(period);

  try {
    const transactionsGroupBy = buildGroupBy("money.created_at", period);
    const transactions = await pool.query(`
      SELECT ${transactionsGroupBy} AS periodo, COUNT(*) AS total, SUM(amount) AS amount
      FROM ${REVENUE_ROWS}
      WHERE money.created_at >= NOW() - ${dateFilter}
      AND NOT money.is_demo
      GROUP BY 1 ORDER BY 1 ASC
    `);

    const usersGroupBy = buildGroupBy("users.created_at", period);
    const users = await pool.query(`
      SELECT ${usersGroupBy} AS periodo, COUNT(*) AS total
      FROM users
      WHERE users.created_at >= NOW() - ${dateFilter}
      GROUP BY 1 ORDER BY 1 ASC
    `);

    const studiosGroupBy = buildGroupBy("studios.created_at", period);
    const studios = await pool.query(`
      SELECT ${studiosGroupBy} AS periodo, COUNT(*) AS total
      FROM studios
      WHERE studios.created_at >= NOW() - ${dateFilter}
      GROUP BY 1 ORDER BY 1 ASC
    `);

    res.json({
      transactions: transactions.rows,
      users: users.rows,
      studios: studios.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener datos de gráficas" });
  }
});

router.get("/users", async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 25;
  const offset = (page - 1) * limit;

  try {
    const countResult = await pool.query(
      `SELECT (SELECT COUNT(*) FROM users) + (SELECT COUNT(*) FROM studio_owners) AS total`,
    );
    const total = parseInt(countResult.rows[0].total, 10);

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
       SELECT * FROM todos
       ORDER BY created_at DESC, id ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    res.json({
      users: result.rows,
      total,
      page,
      totalPages: Math.ceil(total / limit),
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

  try {
    const countResult = await pool.query(
      "SELECT COUNT(*) AS total FROM studios",
    );
    const total = parseInt(countResult.rows[0].total, 10);

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
         studios.is_demo
       FROM studios
       JOIN studio_owners ON studio_owners.id = studios.owner_id
       LEFT JOIN subscriptions subs ON subs.owner_id = studios.owner_id
       LEFT JOIN plans ON plans.id = subs.plan_id
       ORDER BY studios.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    res.json({
      studios: result.rows,
      total,
      page,
      totalPages: Math.ceil(total / limit),
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

