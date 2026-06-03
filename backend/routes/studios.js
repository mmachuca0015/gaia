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

module.exports = router;
