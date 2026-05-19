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

module.exports = router;
