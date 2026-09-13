const crypto = require("crypto");
const pool = require("../db");

// Duracion de la sesion. Se renueva de forma deslizante en cada request.
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const COOKIE_NAME = "pila_session";

const isProduction = process.env.NODE_ENV === "production";

// El token viaja en la cookie; en la base de datos solo vive su hash.
// SHA-256 basta porque el token ya es aleatorio de 256 bits: no hay nada
// que adivinar, a diferencia de una contraseña (que si necesita bcrypt).
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

const cookieOptions = () => ({
  httpOnly: true, // JavaScript del navegador no puede leerla: un XSS no roba la sesion
  secure: isProduction, // solo por HTTPS en produccion
  sameSite: "lax", // el navegador no la manda en POST cross-site: corta CSRF
  path: "/",
  maxAge: SESSION_TTL_MS,
});

// Crea una sesion nueva y deja la cookie en la respuesta.
async function createSession(res, { userId, role, req }) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, role, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      hashToken(token),
      userId,
      role,
      expiresAt,
      req?.get("user-agent")?.slice(0, 500) ?? null,
      req?.ip ?? null,
    ],
  );

  res.cookie(COOKIE_NAME, token, cookieOptions());
  return { expiresAt };
}

// Devuelve { userId, role } si la sesion es valida, o null.
async function readSession(token) {
  if (!token) return null;

  const { rows } = await pool.query(
    `SELECT id, user_id, role FROM sessions
     WHERE token_hash = $1 AND expires_at > NOW()`,
    [hashToken(token)],
  );
  if (rows.length === 0) return null;

  const session = rows[0];

  // Renovacion deslizante: mientras el usuario siga activo, la sesion no expira.
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await pool.query(
    "UPDATE sessions SET last_seen_at = NOW(), expires_at = $1 WHERE id = $2",
    [expiresAt, session.id],
  );

  return { sessionId: session.id, userId: session.user_id, role: session.role };
}

async function destroySession(res, token) {
  if (token) {
    await pool.query("DELETE FROM sessions WHERE token_hash = $1", [
      hashToken(token),
    ]);
  }
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
}

// Cierra la sesion en todos los dispositivos. Se usa al cambiar contraseña.
async function destroyAllSessions(userId, role) {
  await pool.query("DELETE FROM sessions WHERE user_id = $1 AND role = $2", [
    userId,
    role,
  ]);
}

async function deleteExpiredSessions() {
  const { rowCount } = await pool.query(
    "DELETE FROM sessions WHERE expires_at < NOW()",
  );
  return rowCount;
}

module.exports = {
  COOKIE_NAME,
  SESSION_TTL_MS,
  createSession,
  readSession,
  destroySession,
  destroyAllSessions,
  deleteExpiredSessions,
};
