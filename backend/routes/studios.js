const express = require("express");
const router = express.Router();
const pool = require("../db");
const bcrypt = require("bcrypt");

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM studios ORDER BY is_active DESC, created_at ASC",
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
  } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const registerOwner = await pool.query(
      "INSERT INTO studio_owners (name, last_name, email, password) VALUES ( $1, $2, $3, $4 ) RETURNING *",
      [name, last_name, email, hashedPassword],
    );
    const ownerId = registerOwner.rows[0].id;
    const result = await pool.query(
      "INSERT INTO studios ( name, country, state, phone, owner_id) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [studio_name, country, state, phone, ownerId],
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al registrar estudio" });
  }
});

//Ver estudio por ID
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
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
router.get("/:id/clases", async (req, res) => {
  const { id } = req.params;
  const { day } = req.query;

  try {
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
router.post("/favorites/:id", async (req, res) => {
  try {
    const { userId } = req.body;
    const result = await pool.query(
      "INSERT INTO favorites (user_id, studio_id) VALUES ($1, $2) RETURNING *",
      [userId, req.params.id],
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al agregar estudio a favoritos" });
  }
});

router.delete("/favorites/:id", async (req, res) => {
  try {
    const { userId } = req.body;
    const result = await pool.query(
      "DELETE FROM favorites WHERE user_id = $1 and studio_id = $2",
      [userId, req.params.id],
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al eliminar estudio de favoritos" });
  }
});

router.get("/favorites/:userId", async (req, res) => {
  try {
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
router.get("/owner/:ownerId", async (req, res) => {
  try {
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
router.get("/:id/clases-hoy", async (req, res) => {
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
});

//Obtener todas los horarios de las clases de un estudio
router.get("/:id/all-schedules", async (req, res) => {
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
});

//Traer las clases sin horarios
router.get("/:id/classes", async (req, res) => {
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
});

//Agregar una nueva clase
router.post("/:id/add-class", async (req, res) => {
  try {
    const { name, instructor_id, capacity, price, studio_id } = req.body;
    const { classType, selectedDate, selectedDays, selectedTime } = req.body;

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
});

router.delete("/:studioId/classes/:classId", async (req, res) => {
  const { classId } = req.params;
  try {
    // Verificar si hay bookings activas
    const bookings = await pool.query(
      "SELECT * FROM bookings WHERE schedule_id IN (SELECT id FROM schedules WHERE class_id = $1) AND status = 'activa'",
      [classId],
    );

    if (bookings.rows.length > 0) {
      return res
        .status(400)
        .json({ error: "No puedes eliminar una clase con alumnos inscritos" });
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
});

router.put("/:studioId/classes/:classId", async (req, res) => {
  const { classId } = req.params;
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
});

//Obtener la información de los instructores
router.get("/:id/instructors", async (req, res) => {
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
});

//Agregar un instructor
router.post("/:id/instructors", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, last_name } = req.body;
    const result = await pool.query(
      "INSERT INTO instructors (studio_id, name, last_name) VALUES ($1, $2, $3)",
      [id, name, last_name],
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al agregar instructor" });
  }
});

//Eliminar un instructor
router.delete("/:id/instructors/:instructorId", async (req, res) => {
  try {
    const { instructorId } = req.params;
    const result = await pool.query("DELETE FROM instructors WHERE id = $1", [
      instructorId,
    ]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al eliminar instructor" });
  }
});

router.put("/:id", async (req, res) => {
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

router.get("/:id/ingresos", async (req, res) => {
  const { id } = req.params;
  const { period } = req.query;

  let dateFilter = "";
  if (period === "hoy") dateFilter = "AND bookings.created_at >= CURRENT_DATE";
  else if (period === "semana")
    dateFilter = "AND bookings.created_at >= CURRENT_DATE - INTERVAL '7 days'";
  else if (period === "mes")
    dateFilter = "AND bookings.created_at >= CURRENT_DATE - INTERVAL '1 month'";
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
});

router.get("/:id/ingresos-grafica", async (req, res) => {
  const { id } = req.params;
  const { period } = req.query;

  let groupBy = "";
  let dateFilter = "";

  if (period === "hoy") {
    groupBy = "EXTRACT(HOUR FROM bookings.created_at)";
    dateFilter = "AND bookings.created_at >= CURRENT_DATE";
  } else if (period === "semana") {
    groupBy = "DATE(bookings.created_at)";
    dateFilter = "AND bookings.created_at >= CURRENT_DATE - INTERVAL '7 days'";
  } else if (period === "mes") {
    groupBy = "DATE_TRUNC('week', bookings.created_at)";
    dateFilter = "AND bookings.created_at >= CURRENT_DATE - INTERVAL '1 month'";
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
});

router.get("/:id/actividad-reciente", async (req, res) => {
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
});

module.exports = router;
