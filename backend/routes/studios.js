const express = require("express");
const router = express.Router();
const pool = require("../db");
const bcrypt = require("bcrypt");

const { createSession } = require("../auth/sessions");
const {
  requireAuth,
  optionalAuth,
  requireRole,
  requireStudioOwner,
} = require("../middleware/auth");
const { redeemCoupon } = require("./coupons");
const { studioVisibleTo, viewerIsDemo } = require("../services/catalog");

// Los estudios demo solo existen para los usuarios demo. Para cualquier otro
// visitante se responde igual que si el id no existiera.
async function demoHiddenFrom(req, studioId) {
  const { rows } = await pool.query("SELECT is_demo FROM studios WHERE id = $1", [
    studioId,
  ]);
  return rows[0]?.is_demo === true && !(await viewerIsDemo(req.user));
}

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;

router.get("/", optionalAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM studios WHERE ${studioVisibleTo("$1")}
       ORDER BY is_active DESC, created_at ASC`,
      [await viewerIsDemo(req.user)],
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener estudios" });
  }
});

//Registro de estudio
router.post("/register-studio", async (req, res) => {
  const {
    name,
    last_name,
    studio_name,
    country,
    state,
    phone,
    email,
    password,
    plan_id,
    billing_interval,
    coupon_code,
  } = req.body;

  const normalizedEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";

  const client = await pool.connect();
  try {
    if (!name || !last_name || !studio_name || !normalizedEmail || !country) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }

    // Sin plan no hay estudio. Se valida contra la base y no solo su
    // presencia: un plan_id inventado dejaria una suscripcion apuntando a
    // nada, y uno desactivado permitiria contratar una tarifa retirada.
    if (!plan_id) {
      return res.status(400).json({ error: "Elige un plan para continuar" });
    }
    const planCheck = await client.query(
      "SELECT id FROM plans WHERE id = $1 AND is_active = TRUE",
      [plan_id],
    );
    if (planCheck.rows.length === 0) {
      return res.status(400).json({ error: "El plan seleccionado no esta disponible" });
    }
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`,
      });
    }

    // El correo debe ser unico en las tres tablas de cuentas, porque el login
    // las recorre en orden y un duplicado lo volveria ambiguo.
    for (const table of ["users", "studio_owners", "admins"]) {
      const { rows } = await client.query(
        `SELECT 1 FROM ${table} WHERE LOWER(email) = $1`,
        [normalizedEmail],
      );
      if (rows.length > 0) {
        return res
          .status(409)
          .json({ error: "Este correo ya esta registrado" });
      }
    }

    // Dueño y estudio se crean juntos o no se crea ninguno: sin transaccion,
    // un fallo al insertar el estudio dejaba un dueño huerfano que ya ocupaba
    // el correo.
    await client.query("BEGIN");

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const registerOwner = await client.query(
      "INSERT INTO studio_owners (name, last_name, email, password) VALUES ( $1, $2, $3, $4 ) RETURNING id",
      [name, last_name, normalizedEmail, hashedPassword],
    );
    const ownerId = registerOwner.rows[0].id;
    const result = await client.query(
      "INSERT INTO studios ( name, country, state, phone, owner_id) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [studio_name, country, state, phone, ownerId],
    );

    const interval = billing_interval === "year" ? "year" : "month";

    // El cupon se canja aqui dentro, con el renglon bloqueado, y no antes:
    // asi el "un solo uso" se decide en el mismo instante en que se crea el
    // dueño. Si algo falla despues, el ROLLBACK tambien libera el cupon.
    //
    // Se valida aunque el formulario ya lo haya verificado: entre que el dueño
    // lo escribio y llego aqui, otro pudo canjearlo.
    const canje = await redeemCoupon(client, coupon_code, interval, ownerId);
    if (!canje.ok) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: canje.error });
    }

    // Nace 'pendiente'. Solo el webhook de Stripe la pasa a 'activa', porque
    // es el unico que sabe de verdad si el cobro se completo.
    // Solo 'month' o 'year'; cualquier otra cosa cae a mensual en vez de
    // reventar el CHECK de la tabla.
    await client.query(
      "INSERT INTO subscriptions (owner_id, plan_id, status, billing_interval, coupon_id) VALUES ($1, $2, 'pendiente', $3, $4)",
      [ownerId, plan_id, interval, canje.couponId],
    );

    await client.query("COMMIT");

    await createSession(res, { userId: ownerId, role: "owner", req });
    res.status(201).json({ ...result.rows[0], role: "owner" });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err.code === "23505") {
      return res.status(409).json({ error: "Este correo ya esta registrado" });
    }
    console.error(err);
    res.status(500).json({ error: "Error al registrar estudio" });
  } finally {
    client.release();
  }
});

//Ver estudio por ID
router.get("/:id", optionalAuth, async (req, res) => {
  const { id } = req.params;
  try {
    if (await demoHiddenFrom(req, id)) {
      return res.status(404).json({ error: "Estudio no encontrado" });
    }
    const result = await pool.query("SELECT * FROM studios WHERE id = $1", [
      id,
    ]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener estudio" });
  }
});

//Ver clases de un estudio
router.get("/:id/clases", optionalAuth, async (req, res) => {
  const { id } = req.params;
  const { day } = req.query;

  try {
    if (await demoHiddenFrom(req, id)) {
      return res.status(404).json({ error: "Estudio no encontrado" });
    }
    const result = await pool.query(
      `
      SELECT
        classes.id AS class_id,
        schedules.id AS schedule_id,
        classes.name,
        classes.instructor,
        classes.capacity,
        classes.price,
        classes.studio_id,
        schedules.day,
        schedules.time,
        schedules.available_spots
      FROM classes
      JOIN schedules ON classes.id = schedules.class_id
      WHERE classes.studio_id = $1 AND schedules.day = $2
      ORDER BY schedules.time ASC`,
      [id, day],
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener clases" });
  }
});

//Agregar estudio a favoritos
// El id del usuario sale de la sesion, no del body: antes cualquiera podia
// escribir en los favoritos de otra cuenta.
router.post(
  "/favorites/:id",
  requireAuth,
  requireRole("user"),
  async (req, res) => {
    try {
      if (await demoHiddenFrom(req, req.params.id)) {
        return res.status(404).json({ error: "Estudio no encontrado" });
      }
      const result = await pool.query(
        `INSERT INTO favorites (user_id, studio_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING *`,
        [req.user.id, req.params.id],
      );
      res.json(result.rows[0] ?? { success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Error al agregar estudio a favoritos" });
    }
  },
);

router.delete(
  "/favorites/:id",
  requireAuth,
  requireRole("user"),
  async (req, res) => {
    try {
      await pool.query(
        "DELETE FROM favorites WHERE user_id = $1 and studio_id = $2",
        [req.user.id, req.params.id],
      );
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Error al eliminar estudio de favoritos" });
    }
  },
);

router.get("/favorites/:userId", requireAuth, async (req, res) => {
  try {
    if (
      req.user.role !== "admin" &&
      !(req.user.role === "user" && req.user.id === Number(req.params.userId))
    ) {
      return res.status(403).json({ error: "No autorizado" });
    }
    const result = await pool.query(
      `
      SELECT
      favorites.id,
      favorites.user_id,
      favorites.studio_id,
      studios.name,
      studios.cover_url,
      studios.neighborhood,
      studios.rating,
      studios.price_from, studios.is_open
      FROM favorites
      JOIN studios ON studios.id = favorites.studio_id
      WHERE favorites.user_id = $1
      `,
      [req.params.userId],
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener estudios favoritos" });
  }
});

// Obtener estudio por owner_id
router.get("/owner/:ownerId", requireAuth, async (req, res) => {
  try {
    if (
      req.user.role !== "admin" &&
      !(req.user.role === "owner" && req.user.id === Number(req.params.ownerId))
    ) {
      return res.status(403).json({ error: "No autorizado" });
    }
    const result = await pool.query(
      "SELECT * FROM studios WHERE owner_id = $1",
      [req.params.ownerId],
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener estudio" });
  }
});

//Obtener las clases de hoy
router.get(
  "/:id/clases-hoy",
  requireAuth,
  requireStudioOwner(),
  async (req, res) => {
    try {
      const today = new Date().getDay();
      const result = await pool.query(
        `
      SELECT
        classes.id AS class_id,
        schedules.id AS schedule_id,
        classes.name,
        classes.instructor,
        classes.price,
        schedules.time,
        schedules.available_spots,
        classes.capacity
      FROM classes
      JOIN schedules ON classes.id = schedules.class_id
      WHERE classes.studio_id = $1 AND schedules.day = $2
      ORDER BY schedules.time ASC`,
        [req.params.id, today],
      );
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al obtener clases de hoy" });
    }
  },
);

//Obtener todas los horarios de las clases de un estudio
router.get(
  "/:id/all-schedules",
  requireAuth,
  requireStudioOwner(),
  async (req, res) => {
    try {
      const result = await pool.query(
        `
      SELECT
        classes.id AS class_id,
        classes.name,
        COALESCE(instructors.name || ' ' || instructors.last_name, classes.instructor) AS instructor,
        classes.capacity,
        classes.price,
        schedules.id AS schedule_id,
        schedules.day,
        schedules.time,
        schedules.is_permanent,
        schedules.date
      FROM classes
      LEFT JOIN schedules ON classes.id = schedules.class_id
      LEFT JOIN instructors ON classes.instructor_id = instructors.id
      WHERE classes.studio_id = $1
      ORDER BY schedules.day ASC, schedules.time ASC`,
        [req.params.id],
      );
      res.json(result.rows);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Error al obtener horarios" });
    }
  },
);

//Traer las clases sin horarios
router.get(
  "/:id/classes",
  requireAuth,
  requireStudioOwner(),
  async (req, res) => {
    try {
      const result = await pool.query(
        `
      SELECT 
        classes.*,
        COALESCE(instructors.name || ' ' || instructors.last_name, classes.instructor) AS instructor_name
      FROM classes
      LEFT JOIN instructors ON classes.instructor_id = instructors.id
      WHERE classes.studio_id = $1
      ORDER BY classes.name ASC
    `,
        [req.params.id],
      );
      res.json(result.rows);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Error al obtener clases" });
    }
  },
);

//Agregar una nueva clase
router.post(
  "/:id/add-class",
  requireAuth,
  requireStudioOwner(),
  async (req, res) => {
    try {
      const { name, instructor_id, capacity, price } = req.body;
      const { classType, selectedDate, selectedDays, selectedTime } = req.body;

      // El studio_id sale del parametro ya verificado, no del body: antes se
      // comprobaba un estudio y se insertaba en otro.
      const studio_id = req.params.id;

      const result = await pool.query(
        "INSERT INTO classes (name, instructor_id, capacity, price, studio_id) VALUES ($1, $2, $3, $4, $5) RETURNING id",
        [name, instructor_id, capacity, price, studio_id],
      );
      const classId = result.rows[0].id;

      if (classType === "única") {
        await pool.query(
          "INSERT INTO schedules (date, time, class_id, available_spots, is_permanent) VALUES ($1, $2, $3, $4, false)",
          [selectedDate, selectedTime, classId, capacity],
        );
      } else if (classType === "permanente") {
        for (const day of selectedDays) {
          await pool.query(
            "INSERT INTO schedules (day, time, class_id, available_spots, is_permanent) VALUES ($1, $2, $3, $4, true)",
            [day, selectedTime, classId, capacity],
          );
        }
      }

      res.json({ message: "Clase agregada correctamente" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Error al agregar clase" });
    }
  },
);

router.delete(
  "/:studioId/classes/:classId",
  requireAuth,
  requireStudioOwner("studioId"),
  async (req, res) => {
    const { studioId, classId } = req.params;
    try {
      // La clase tiene que ser de ESTE estudio. Sin esta comprobacion, un dueño
      // podia pasar su propio studioId y el classId de otro estudio.
      const owned = await pool.query(
        "SELECT 1 FROM classes WHERE id = $1 AND studio_id = $2",
        [classId, studioId],
      );
      if (owned.rows.length === 0) {
        return res.status(404).json({ error: "Clase no encontrada" });
      }

      // Verificar si hay bookings activas
      const bookings = await pool.query(
        "SELECT * FROM bookings WHERE schedule_id IN (SELECT id FROM schedules WHERE class_id = $1) AND status = 'activa'",
        [classId],
      );

      if (bookings.rows.length > 0) {
        return res.status(400).json({
          error: "No puedes eliminar una clase con alumnos inscritos",
        });
      }

      // Eliminar schedules primero
      await pool.query("DELETE FROM schedules WHERE class_id = $1", [classId]);

      // Eliminar la clase
      await pool.query("DELETE FROM classes WHERE id = $1", [classId]);

      res.json({ message: "Clase eliminada correctamente" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al eliminar clase" });
    }
  },
);

router.put(
  "/:studioId/classes/:classId",
  requireAuth,
  requireStudioOwner("studioId"),
  async (req, res) => {
    const { studioId, classId } = req.params;
    const {
      name,
      instructor_id,
      capacity,
      price,
      classType,
      selectedDate,
      selectedDays,
      selectedTime,
    } = req.body;

    try {
      const owned = await pool.query(
        "SELECT 1 FROM classes WHERE id = $1 AND studio_id = $2",
        [classId, studioId],
      );
      if (owned.rows.length === 0) {
        return res.status(404).json({ error: "Clase no encontrada" });
      }

      // Actualizar la clase
      await pool.query(
        "UPDATE classes SET name = $1, instructor_id = $2, capacity = $3, price = $4 WHERE id = $5",
        [name, instructor_id, capacity, price, classId],
      );

      // Eliminar horarios anteriores
      await pool.query("DELETE FROM schedules WHERE class_id = $1", [classId]);

      // Insertar nuevos horarios
      if (classType === "única") {
        await pool.query(
          "INSERT INTO schedules (date, time, class_id, available_spots, is_permanent) VALUES ($1, $2, $3, $4, false)",
          [selectedDate, selectedTime, classId, capacity],
        );
      } else {
        for (const day of selectedDays) {
          await pool.query(
            "INSERT INTO schedules (day, time, class_id, available_spots, is_permanent) VALUES ($1, $2, $3, $4, true)",
            [day, selectedTime, classId, capacity],
          );
        }
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al actualizar clase" });
    }
  },
);

//Obtener la información de los instructores
router.get(
  "/:id/instructors",
  requireAuth,
  requireStudioOwner(),
  async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query(
        `
      SELECT 
        instructors.*,
        COUNT(DISTINCT schedules.id) FILTER (WHERE schedules.is_permanent = true) AS classes_per_week
      FROM instructors
      LEFT JOIN classes ON classes.instructor_id = instructors.id
      LEFT JOIN schedules ON schedules.class_id = classes.id
      WHERE instructors.studio_id = $1
      GROUP BY instructors.id
    `,
        [id],
      );
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al obtener instructores" });
    }
  },
);

//Agregar un instructor
router.post(
  "/:id/instructors",
  requireAuth,
  requireStudioOwner(),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, last_name } = req.body;
      if (!name || !last_name) {
        return res.status(400).json({ error: "Faltan campos obligatorios" });
      }
      await pool.query(
        "INSERT INTO instructors (studio_id, name, last_name) VALUES ($1, $2, $3)",
        [id, name, last_name],
      );
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al agregar instructor" });
    }
  },
);

//Eliminar un instructor
router.delete(
  "/:id/instructors/:instructorId",
  requireAuth,
  requireStudioOwner(),
  async (req, res) => {
    try {
      const { id, instructorId } = req.params;
      // El DELETE se acota al estudio: antes borraba cualquier instructor por
      // id, sin importar de quien fuera.
      const result = await pool.query(
        "DELETE FROM instructors WHERE id = $1 AND studio_id = $2",
        [instructorId, id],
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Instructor no encontrado" });
      }
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al eliminar instructor" });
    }
  },
);

router.put("/:id", requireAuth, requireStudioOwner(), async (req, res) => {
  const { id } = req.params;
  const {
    name,
    description,
    street,
    ext_number,
    int_number,
    neighborhood,
    city,
    state,
    country,
    zip_code,
    cover_url,
    logo_url,
    latitude,
    longitude,
  } = req.body;
  try {
    await pool.query(
      `UPDATE studios SET 
        name = CASE WHEN $1 != '' THEN $1 ELSE name END,
        description = CASE WHEN $2 != '' THEN $2 ELSE description END,
        street = CASE WHEN $3 != '' THEN $3 ELSE street END,
        ext_number = CASE WHEN $4 != '' THEN $4 ELSE ext_number END,
        int_number = CASE WHEN $5 != '' THEN $5 ELSE int_number END,
        neighborhood = CASE WHEN $6 != '' THEN $6 ELSE neighborhood END,
        city = CASE WHEN $7 != '' THEN $7 ELSE city END,
        state = CASE WHEN $8 != '' THEN $8 ELSE state END,
        country = CASE WHEN $9 != '' THEN $9 ELSE country END,
        zip_code = CASE WHEN $10 != '' THEN $10 ELSE zip_code END,
        cover_url = CASE WHEN $11 != '' THEN $11 ELSE cover_url END,
        logo_url = CASE WHEN $12 != '' THEN $12 ELSE logo_url END,
        latitude = CASE WHEN $13::float IS NOT NULL AND $13::float != 0 THEN $13::float ELSE latitude END,
longitude = CASE WHEN $14::float IS NOT NULL AND $14::float != 0 THEN $14::float ELSE longitude END
      WHERE id = $15`,
      [
        name ?? "",
        description ?? "",
        street ?? "",
        ext_number ?? "",
        int_number ?? "",
        neighborhood ?? "",
        city ?? "",
        state ?? "",
        country ?? "",
        zip_code ?? "",
        cover_url ?? "",
        logo_url ?? "",
        latitude ?? 0,
        longitude ?? 0,
        id,
      ],
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar estudio" });
  }
});

router.get(
  "/:id/ingresos",
  requireAuth,
  requireStudioOwner(),
  async (req, res) => {
    const { id } = req.params;
    const { period } = req.query;

    let dateFilter = "";
    if (period === "hoy")
      dateFilter = "AND bookings.created_at >= CURRENT_DATE";
    else if (period === "semana")
      dateFilter =
        "AND bookings.created_at >= CURRENT_DATE - INTERVAL '7 days'";
    else if (period === "mes")
      dateFilter =
        "AND bookings.created_at >= CURRENT_DATE - INTERVAL '1 month'";
    else if (period === "semestral")
      dateFilter =
        "AND bookings.created_at >= CURRENT_DATE - INTERVAL '6 months'";

    try {
      const result = await pool.query(
        `
      SELECT 
        SUM(classes.price) AS total,
        COUNT(bookings.id) AS reservas
      FROM bookings
      JOIN schedules ON bookings.schedule_id = schedules.id
      JOIN classes ON schedules.class_id = classes.id
      WHERE classes.studio_id = $1
      AND bookings.status = 'activa'
      ${dateFilter}
    `,
        [id],
      );
      res.json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al obtener ingresos" });
    }
  },
);

router.get(
  "/:id/ingresos-grafica",
  requireAuth,
  requireStudioOwner(),
  async (req, res) => {
    const { id } = req.params;
    const { period } = req.query;

    let groupBy = "";
    let dateFilter = "";

    if (period === "hoy") {
      groupBy = "EXTRACT(HOUR FROM bookings.created_at)";
      dateFilter = "AND bookings.created_at >= CURRENT_DATE";
    } else if (period === "semana") {
      groupBy = "DATE(bookings.created_at)";
      dateFilter =
        "AND bookings.created_at >= CURRENT_DATE - INTERVAL '7 days'";
    } else if (period === "mes") {
      groupBy = "DATE_TRUNC('week', bookings.created_at)";
      dateFilter =
        "AND bookings.created_at >= CURRENT_DATE - INTERVAL '1 month'";
    } else if (period === "semestral") {
      groupBy = "DATE_TRUNC('month', bookings.created_at)";
      dateFilter =
        "AND bookings.created_at >= CURRENT_DATE - INTERVAL '6 months'";
    }

    try {
      const result = await pool.query(
        `
      SELECT 
        ${groupBy} AS periodo,
        SUM(classes.price) AS total
      FROM bookings
      JOIN schedules ON bookings.schedule_id = schedules.id
      JOIN classes ON schedules.class_id = classes.id
      WHERE classes.studio_id = $1
      AND bookings.status = 'activa'
      ${dateFilter}
      GROUP BY periodo
      ORDER BY periodo ASC
    `,
        [id],
      );
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al obtener datos de gráfica" });
    }
  },
);

router.get(
  "/:id/actividad-reciente",
  requireAuth,
  requireStudioOwner(),
  async (req, res) => {
    const { id } = req.params;
    try {
      const reservas = await pool.query(
        `
      SELECT 
        users.name,
        users.last_name,
        classes.name AS class_name,
        schedules.day,
        schedules.time,
        bookings.created_at,
        'reserva' AS tipo
      FROM bookings
      JOIN schedules ON bookings.schedule_id = schedules.id
      JOIN classes ON schedules.class_id = classes.id
      JOIN users ON bookings.user_id = users.id
      WHERE classes.studio_id = $1
      ORDER BY bookings.created_at DESC
      LIMIT 5
    `,
        [id],
      );

      const favoritos = await pool.query(
        `
      SELECT 
        users.name,
        users.last_name,
        favorites.created_at,
        'favorito' AS tipo
      FROM favorites
      JOIN users ON favorites.user_id = users.id
      WHERE favorites.studio_id = $1
      ORDER BY favorites.created_at DESC
      LIMIT 5
    `,
        [id],
      );

      const actividad = [...reservas.rows, ...favoritos.rows]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        .slice(0, 8);

      res.json(actividad);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al obtener actividad reciente" });
    }
  },
);

router.get(
  "/:id/reservas",
  requireAuth,
  requireStudioOwner(),
  async (req, res) => {
    const { id } = req.params;
    const { type } = req.query; // 'proximas' o 'pasadas'

    try {
      const result = await pool.query(
        `
      SELECT 
        schedules.id AS schedule_id,
        classes.name AS class_name,
        COALESCE(instructors.name || ' ' || instructors.last_name, classes.instructor) AS instructor,
        classes.capacity,
        schedules.time,
        bookings.class_date,
        COUNT(bookings.id) AS reservas_count,
        classes.capacity - COUNT(bookings.id) AS available_spots
      FROM schedules
      JOIN classes ON schedules.class_id = classes.id
      LEFT JOIN instructors ON classes.instructor_id = instructors.id
      JOIN bookings ON bookings.schedule_id = schedules.id
      WHERE classes.studio_id = $1
      AND bookings.status = $2
      AND bookings.class_date ${type === "proximas" ? ">= CURRENT_DATE" : "< CURRENT_DATE AND bookings.class_date >= CURRENT_DATE - INTERVAL '1 month'"}
      GROUP BY schedules.id, classes.name, instructors.name, instructors.last_name, classes.instructor, classes.capacity, schedules.time, bookings.class_date
      ORDER BY bookings.class_date ASC
    `,
        [id, type === "proximas" ? "activa" : "pasada"],
      );

      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al obtener reservas" });
    }
  },
);

router.get(
  "/:id/reservas/:scheduleId/usuarios",
  requireAuth,
  requireStudioOwner(),
  async (req, res) => {
    const { scheduleId } = req.params;
    const { classDate } = req.query;

    try {
      const result = await pool.query(
        `
      SELECT 
        users.name,
        users.last_name,
        users.email
      FROM bookings
      JOIN users ON bookings.user_id = users.id
      WHERE bookings.schedule_id = $1
      AND bookings.class_date = $2
      AND bookings.status = 'activa'
      ORDER BY users.name ASC
    `,
        [scheduleId, classDate],
      );

      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al obtener usuarios" });
    }
  },
);

module.exports = router;
