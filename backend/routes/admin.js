const express = require("express");
const router = express.Router();
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

// Todo el panel de administracion exige sesion con rol admin. Antes estas
// rutas eran publicas: cualquiera podia listar usuarios y estudios.
router.use(requireAuth, requireRole("admin"));

// Métricas generales
router.get("/metrics", async (req, res) => {
  try {
    // Las reservas de estudios demo no mueven dinero: no cuentan en metricas.
    const transactions = await pool.query(
      "SELECT COUNT(*) AS total, SUM(classes.price) AS total_amount FROM bookings JOIN schedules ON bookings.schedule_id = schedules.id JOIN classes ON schedules.class_id = classes.id JOIN studios ON studios.id = classes.studio_id WHERE bookings.status = 'activa' AND NOT studios.is_demo",
    );

    const pilaCommission = await pool.query(
      "SELECT SUM(classes.price * 0.036) AS commission FROM bookings JOIN schedules ON bookings.schedule_id = schedules.id JOIN classes ON schedules.class_id = classes.id JOIN studios ON studios.id = classes.studio_id WHERE bookings.status = 'activa' AND NOT studios.is_demo",
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
    const transactionsGroupBy = buildGroupBy("bookings.created_at", period);
    const transactions = await pool.query(`
      SELECT ${transactionsGroupBy} AS periodo, COUNT(*) AS total, SUM(classes.price) AS amount
      FROM bookings
      JOIN schedules ON bookings.schedule_id = schedules.id
      JOIN classes ON schedules.class_id = classes.id
      JOIN studios ON studios.id = classes.studio_id
      WHERE bookings.created_at >= NOW() - ${dateFilter}
      AND bookings.status = 'activa'
      AND NOT studios.is_demo
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
         'Sin plan' AS plan,
         studios.is_demo
       FROM studios
       JOIN studio_owners ON studio_owners.id = studios.owner_id
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

module.exports = router;
