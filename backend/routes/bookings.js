const express = require("express");
const router = express.Router();
const pool = require("../db");

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        bookings.id,
        bookings.status,
        studios.name AS studio_name,
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
        schedules.time
      FROM bookings
      JOIN schedules ON bookings.schedule_id = schedules.id
      JOIN classes ON schedules.class_id = classes.id
      JOIN studios ON classes.studio_id = studios.id
      LEFT JOIN instructors ON classes.instructor_id = instructors.id
      WHERE bookings.user_id = 1
      ORDER BY bookings.id ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
