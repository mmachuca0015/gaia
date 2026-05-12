const express = require("express");
const router = express.Router();
const pool = require("../db");

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`SELECT
            bookings.id,
            bookings.status,
            studios.name AS studio_name,
            classes.instructor,
            schedules.day,
            schedules.time
            FROM bookings
            JOIN schedules ON bookings.schedule_id = schedules.id
            JOIN classes ON schedules.class_id = classes.id
            JOIN studios ON classes.studio_id = studios.id
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
