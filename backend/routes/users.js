const express = require("express");
const router = express.Router();
const pool = require("../db");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

const {
  COOKIE_NAME,
  createSession,
  destroySession,
  destroyAllSessions,
} = require("../auth/sessions");
const { requireAuth } = require("../middleware/auth");

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;
const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")[0]
  .trim();

// Cada rol vive en su propia tabla. El rol NUNCA llega del cliente: se
// determina aqui al buscar el correo y queda grabado en la sesion.
const TABLE_BY_ROLE = {
  user: "users",
  owner: "studio_owners",
  admin: "admins",
};

// Campos que si pueden salir al cliente. Se enumeran de forma explicita para
// que el hash de la contraseña no pueda filtrarse por descuido.
const USER_FIELDS = [
  "id",
  "name",
  "last_name",
  "email",
  "state",
  "country",
  "stripe_customer_id",
  // Cuenta de demostracion: el frontend no le pide tarjeta para reservar.
  // Solo cambia lo que se muestra; quien decide si se cobra es el backend.
  "is_demo",
];
const OWNER_FIELDS = ["id", "name", "last_name", "email"];

// `admins` no tiene last_name. Antes esta lista se derivaba con un ternario
// (user ? USER_FIELDS : OWNER_FIELDS), asi que a un admin se le pedia una
// columna inexistente: /users/me respondia 500, ProtectedRoute lo leia como
// "sin sesion" y devolvia al login justo despues de entrar bien.
const ADMIN_FIELDS = ["id", "name", "email"];

const FIELDS_BY_ROLE = {
  user: USER_FIELDS,
  owner: OWNER_FIELDS,
  admin: ADMIN_FIELDS,
};

const fieldsFor = (role) => FIELDS_BY_ROLE[role] ?? ADMIN_FIELDS;

// Limite de intentos de login por IP: frena fuerza bruta y relleno de
// credenciales sin estorbar a un usuario normal.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Intenta de nuevo en unos minutos." },
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Intenta de nuevo mas tarde." },
});

// Hash desechable para gastar el mismo tiempo cuando el correo no existe.
// Sin esto, la diferencia en el tiempo de respuesta revela que correos estan
// registrados (enumeracion de usuarios).
const DUMMY_HASH = bcrypt.hashSync("contrasena-que-no-existe", BCRYPT_ROUNDS);

function validatePassword(password) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`;
  }
  if (password.length > 200) {
    return "La contraseña es demasiado larga";
  }
  return null;
}

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function pickFields(row, fields) {
  return Object.fromEntries(
    fields.filter((f) => f in row).map((f) => [f, row[f]]),
  );
}

// Busca un correo en las tres tablas y devuelve { account, role } o null.
async function findAccountByEmail(email) {
  for (const [role, table] of Object.entries(TABLE_BY_ROLE)) {
    const { rows } = await pool.query(
      `SELECT * FROM ${table} WHERE LOWER(email) = $1`,
      [email],
    );
    if (rows.length > 0) return { account: rows[0], role };
  }
  return null;
}

// Perfil del usuario de la sesion actual. El frontend lo usa para saber si
// sigue autenticado.
router.get("/me", requireAuth, async (req, res) => {
  try {
    const fields = fieldsFor(req.user.role);
    const { rows } = await pool.query(
      `SELECT ${fields.join(", ")} FROM ${TABLE_BY_ROLE[req.user.role]} WHERE id = $1`,
      [req.user.id],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    res.json({ ...rows[0], role: req.user.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// Login
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;

    if (!email || typeof password !== "string" || !password) {
      return res.status(400).json({ error: "Correo y contraseña requeridos" });
    }

    const found = await findAccountByEmail(email);

    // Siempre se ejecuta un bcrypt.compare, exista o no la cuenta, y el
    // mensaje de error es identico en ambos casos: un atacante no puede
    // distinguir "correo no registrado" de "contraseña incorrecta".
    const hash = found ? found.account.password : DUMMY_HASH;
    const validPassword = await bcrypt.compare(password, hash);

    if (!found || !validPassword) {
      return res.status(401).json({ error: "Correo o contraseña incorrectos" });
    }

    const { account, role } = found;
    await createSession(res, { userId: account.id, role, req });

    res.json({ ...pickFields(account, fieldsFor(role)), role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// Cierra la sesion actual.
router.post("/logout", async (req, res) => {
  try {
    await destroySession(res, req.cookies?.[COOKIE_NAME]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// Cierra la sesion en todos los dispositivos.
router.post("/logout-all", requireAuth, async (req, res) => {
  try {
    await destroyAllSessions(req.user.id, req.user.role);
    await destroySession(res, req.cookies?.[COOKIE_NAME]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// Register
router.post("/register", async (req, res) => {
  const { name, last_name, state, country, password } = req.body;
  const email = normalizeEmail(req.body.email);

  try {
    if (!name || !last_name || !email || !state || !country) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    // El correo debe ser unico en las tres tablas, no solo en users: de lo
    // contrario el login (que las busca en orden) se vuelve ambiguo.
    if (await findAccountByEmail(email)) {
      return res.status(409).json({ error: "Este correo ya esta registrado" });
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const { rows } = await pool.query(
      `INSERT INTO users (name, last_name, email, password, state, country)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${USER_FIELDS.join(", ")}`,
      [name, last_name, email, hashedPassword, state, country],
    );

    const user = rows[0];
    await createSession(res, { userId: user.id, role: "user", req });
    res.status(201).json({ ...user, role: "user" });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Este correo ya esta registrado" });
    }
    console.error(err);
    res.status(500).json({ error: "Error al registrar usuario" });
  }
});

// Solicitud de recuperacion de contraseña
router.post("/test", passwordResetLimiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);

  // Respuesta identica exista o no la cuenta: si respondieramos "usuario no
  // encontrado", este endpoint seria un oraculo para saber quien tiene cuenta.
  const genericResponse = {
    message: "Si el correo esta registrado, te enviamos un enlace",
  };

  try {
    const found = await findAccountByEmail(email);
    if (!found || found.role === "admin") {
      return res.json(genericResponse);
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    // Se invalidan los tokens anteriores del mismo correo: solo debe servir
    // el ultimo enlace enviado.
    await pool.query("DELETE FROM password_resets WHERE email = $1", [email]);
    await pool.query(
      "INSERT INTO password_resets (email, token, expires_at) VALUES ($1, $2, $3)",
      [email, tokenHash, expiresAt],
    );

    await resend.emails.send({
      from: "Wellco <onboarding@resend.dev>",
      to: email,
      subject: "Recupera tu contraseña",
      html: `<p>Haz click en el siguiente link para recuperar tu contraseña. Este link expira en 30 minutos.</p>
           <a href="${FRONTEND_URL}/reset-password?token=${token}">Recuperar contraseña</a>`,
    });

    res.json(genericResponse);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// Reset password
router.post("/reset-password", async (req, res) => {
  const { token, password } = req.body;

  try {
    if (typeof token !== "string" || !token) {
      return res.status(400).json({ error: "Token invalido o expirado" });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    // En la tabla se guarda el hash del token, no el token: quien lea la
    // base de datos no puede usar los enlaces pendientes.
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const result = await pool.query(
      "SELECT * FROM password_resets WHERE token = $1",
      [tokenHash],
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Token invalido o expirado" });
    }

    if (new Date(result.rows[0].expires_at) < new Date()) {
      await pool.query("DELETE FROM password_resets WHERE token = $1", [
        tokenHash,
      ]);
      return res.status(400).json({ error: "Token invalido o expirado" });
    }

    const email = result.rows[0].email;
    const found = await findAccountByEmail(email);
    if (!found) {
      return res.status(400).json({ error: "Token invalido o expirado" });
    }

    const newPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await pool.query(
      `UPDATE ${TABLE_BY_ROLE[found.role]} SET password = $1 WHERE id = $2`,
      [newPassword, found.account.id],
    );

    await pool.query("DELETE FROM password_resets WHERE token = $1", [
      tokenHash,
    ]);

    // Quien recupera la contraseña suele ser alguien que perdio el control de
    // la cuenta: se cierran todas las sesiones abiertas.
    await destroyAllSessions(found.account.id, found.role);

    res.json({ message: "Contraseña actualizada correctamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// Waitlist (publico)
router.post("/waitlist", async (req, res) => {
  const email = normalizeEmail(req.body.email);

  try {
    if (!email) {
      return res.status(400).json({ error: "Correo requerido" });
    }
    await pool.query("INSERT INTO waitlist (email) VALUES ($1)", [email]);
    res.json({ message: "Email agregado a la lista de espera correctamente" });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ error: "Este correo ya está registrado" });
    }
    console.error(err);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// Verificar la contraseña actual del usuario de la sesion.
router.post("/verify-password", requireAuth, async (req, res) => {
  try {
    const { typedPassword } = req.body;
    if (typeof typedPassword !== "string" || !typedPassword) {
      return res.json({ isValid: false });
    }

    const { rows } = await pool.query(
      `SELECT password FROM ${TABLE_BY_ROLE[req.user.role]} WHERE id = $1`,
      [req.user.id],
    );
    const isValid = await bcrypt.compare(
      typedPassword,
      rows[0]?.password || DUMMY_HASH,
    );
    res.json({ isValid: rows.length > 0 && isValid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al verificar contraseña" });
  }
});

// Cambiar correo. Exige la contraseña actual en la MISMA peticion: validarla
// en un paso previo no sirve de nada si se puede llamar directo a este
// endpoint.
router.post("/change-email", requireAuth, async (req, res) => {
  try {
    const { currentPassword } = req.body;
    const newEmail = normalizeEmail(req.body.newEmail);

    if (!newEmail || !newEmail.includes("@")) {
      return res.status(400).json({ error: "Correo invalido" });
    }

    const table = TABLE_BY_ROLE[req.user.role];
    const { rows } = await pool.query(
      `SELECT password FROM ${table} WHERE id = $1`,
      [req.user.id],
    );
    const validPassword = await bcrypt.compare(
      currentPassword || "",
      rows[0]?.password || DUMMY_HASH,
    );
    if (!validPassword) {
      return res.status(403).json({ error: "Contraseña incorrecta" });
    }

    const existing = await findAccountByEmail(newEmail);
    if (existing && existing.account.id !== req.user.id) {
      return res.status(409).json({ error: "Este correo ya esta registrado" });
    }

    await pool.query(`UPDATE ${table} SET email = $1 WHERE id = $2`, [
      newEmail,
      req.user.id,
    ]);
    res.json({ success: true, email: newEmail });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Este correo ya esta registrado" });
    }
    console.error(err);
    res
      .status(500)
      .json({ error: "Error al actualizar el correo electrónico." });
  }
});

// Cambiar contraseña. Exige la contraseña actual y cierra el resto de sesiones.
router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const table = TABLE_BY_ROLE[req.user.role];
    const { rows } = await pool.query(
      `SELECT password FROM ${table} WHERE id = $1`,
      [req.user.id],
    );
    const validPassword = await bcrypt.compare(
      currentPassword || "",
      rows[0]?.password || DUMMY_HASH,
    );
    if (!validPassword) {
      return res.status(403).json({ error: "Contraseña incorrecta" });
    }

    const hashNewPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await pool.query(`UPDATE ${table} SET password = $1 WHERE id = $2`, [
      hashNewPassword,
      req.user.id,
    ]);

    // Si alguien mas tenia la sesion abierta, queda fuera. Se emite una
    // cookie nueva para que quien hizo el cambio siga dentro.
    await destroyAllSessions(req.user.id, req.user.role);
    await createSession(res, { userId: req.user.id, role: req.user.role, req });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar la contraseña" });
  }
});

// Perfil por id: solo el propio usuario o un admin.
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Id invalido" });
    }
    // Se compara rol ademas de id: users.id 7 y studio_owners.id 7 son
    // cuentas distintas que comparten numero.
    if (
      req.user.role !== "admin" &&
      !(req.user.role === "user" && req.user.id === id)
    ) {
      return res.status(403).json({ error: "No autorizado" });
    }

    const { rows } = await pool.query(
      `SELECT ${USER_FIELDS.join(", ")} FROM users WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener usuario" });
  }
});

// Datos del dueño: solo el propio dueño o un admin.
router.get("/studio-owner/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Id invalido" });
    }
    if (
      req.user.role !== "admin" &&
      !(req.user.role === "owner" && req.user.id === id)
    ) {
      return res.status(403).json({ error: "No autorizado" });
    }

    const { rows } = await pool.query(
      `SELECT ${OWNER_FIELDS.join(", ")} FROM studio_owners WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Dueño no encontrado" });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener dueño" });
  }
});

// Los endpoints /verify-owner-password, /change-owner-email y
// /change-owner-password se eliminaron: /verify-password, /change-email y
// /change-password ya operan sobre la tabla que corresponde al rol de la
// sesion, asi que hacian lo mismo pero sin comprobar nada.

module.exports = router;
