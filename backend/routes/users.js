const express = require("express");
const router = express.Router();
const pool = require("../db");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

// Get user for "profile"
router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users WHERE id = 1");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    let result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    let role = "user";

    if (result.rows.length === 0) {
      result = await pool.query(
        "SELECT * FROM studio_owners WHERE email = $1",
        [email],
      );
      role = "owner";
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: "Correo o contraseña incorrectos" });
    }
    res.json({ ...user, role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// Register
router.post("/register", async (req, res) => {
  const { name, last_name, email, password, state, country } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (name, last_name, email, password, state, country) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [name, last_name, email, hashedPassword, state, country],
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al registrar usuario" });
  }
});

//Recover password form
router.post("/test", async (req, res) => {
  const { email } = req.body;

  try {
    // Buscar en users
    let result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    // Si no está en users, buscar en studio_owners
    if (result.rows.length === 0) {
      result = await pool.query(
        "SELECT * FROM studio_owners WHERE email = $1",
        [email],
      );

      // Si no está en ninguna tabla
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }
    }

    // Generar token único y fecha de expiración (30 minutos)
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    // Guardar token en la base de datos
    await pool.query(
      "INSERT INTO password_resets (email, token, expires_at) VALUES ($1, $2, $3)",
      [email, token, expiresAt],
    );

    // Mandar email con Resend
    await resend.emails.send({
      from: "PILA <onboarding@resend.dev>",
      to: email,
      subject: "Recupera tu contraseña",
      html: `<p>Haz click en el siguiente link para recuperar tu contraseña. Este link expira en 30 minutos.</p>
           <a href="http://localhost:5173/reset-password?token=${token}">Recuperar contraseña</a>`,
    });

    res.json({ message: "Email enviado correctamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error del servidor" });
  }
});

//Reset password
router.post("/reset-password", async (req, res) => {
  const { token, password } = req.body;

  try {
    const result = await pool.query(
      "SELECT * FROM password_resets WHERE token = $1",
      [token],
    );
    const time = new Date(Date.now());

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Token no encontrado" });
    }

    if (result.rows[0].expires_at < time) {
      return res.status(400).json({ error: "Token expirado" });
    }

    const newPassword = await bcrypt.hash(password, 10);
    const email = result.rows[0].email;

    //Actualizar contraseña en la base de datos
    const newResult = await pool.query(
      "UPDATE users SET password = $1 WHERE email = $2",
      [newPassword, email],
    );

    if (newResult.rowCount === 0) {
      await pool.query(
        "UPDATE studio_owners SET password = $1 WHERE email = $2",
        [newPassword, email],
      );
    }

    //Borrar token de la base de datos
    await pool.query("DELETE FROM password_resets WHERE token = $1", [token]);

    res.json({ message: "Contraseña actualizada correctamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error del servidor" });
  }
});

//Waitlist
router.post("/waitlist", async (req, res) => {
  const { email } = req.body;

  try {
    const result = await pool.query(
      "INSERT INTO waitlist (email) VALUES ($1)",
      [email],
    );
    res.json({ message: "Email agregado a la lista de espera correctamente" });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ error: "Este correo ya está registrado" });
    }
    console.error(err);
    res.status(500).json({ error: "Error del servidor" });
  }
});

//Obtenr usuario
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [
      req.params.id,
    ]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener usuario" });
  }
});

//verificar contraseña
router.post("/verify-password", async (req, res) => {
  try {
    const { typedPassword, userId } = req.body;
    const result = await pool.query(
      "SELECT password FROM users WHERE id = $1",
      [userId],
    );
    const password = result.rows[0].password;
    const isValid = await bcrypt.compare(typedPassword, password);
    res.json({ isValid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al verificar contraseña" });
  }
});

router.post("/change-email", async (req, res) => {
  try {
    const { newEmail, userId } = req.body;
    const result = await pool.query(
      "UPDATE users SET email = $1 WHERE id = $2",
      [newEmail, userId],
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: "Error al actualizar el correo electrónico." });
  }
});

//Cambiar contraseña
router.post("/change-password", async (req, res) => {
  try {
    const { newPassword, userId } = req.body;
    const hashNewPassword = await bcrypt.hash(newPassword, 10);
    const result = await pool.query(
      "UPDATE users SET password = $1 WHERE id = $2",
      [hashNewPassword, userId],
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar la contraseña" });
  }
});

router.get("/studio-owner/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, last_name, email FROM studio_owners WHERE id = $1",
      [req.params.id],
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener dueño" });
  }
});

// Verificar contraseña del dueño
router.post("/verify-owner-password", async (req, res) => {
  try {
    const { typedPassword, userId } = req.body;
    const result = await pool.query(
      "SELECT password FROM studio_owners WHERE id = $1",
      [userId],
    );
    const isValid = await bcrypt.compare(
      typedPassword,
      result.rows[0].password,
    );
    res.json({ isValid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al verificar contraseña" });
  }
});

// Cambiar correo del dueño
router.post("/change-owner-email", async (req, res) => {
  try {
    const { newEmail, userId } = req.body;
    await pool.query("UPDATE studio_owners SET email = $1 WHERE id = $2", [
      newEmail,
      userId,
    ]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar correo" });
  }
});

// Cambiar contraseña del dueño
router.post("/change-owner-password", async (req, res) => {
  try {
    const { newPassword, userId } = req.body;
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE studio_owners SET password = $1 WHERE id = $2", [
      hashedPassword,
      userId,
    ]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar contraseña" });
  }
});

module.exports = router;
