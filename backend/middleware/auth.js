const pool = require("../db");
const { COOKIE_NAME, readSession } = require("../auth/sessions");

// Exige sesion valida. Deja { id, role } en req.user.
// A partir de aqui NINGUNA ruta debe leer el id del usuario del body o del
// query: el id autoritativo es req.user.id, que viene de la cookie firmada
// por el servidor y no lo puede manipular el cliente.
async function requireAuth(req, res, next) {
  try {
    const session = await readSession(req.cookies?.[COOKIE_NAME]);
    if (!session) {
      return res.status(401).json({ error: "No autenticado" });
    }
    req.user = { id: session.userId, role: session.role };
    req.sessionToken = req.cookies[COOKIE_NAME];
    next();
  } catch (err) {
    console.error("Error al leer la sesion:", err);
    res.status(500).json({ error: "Error del servidor" });
  }
}

// Exige que el rol de la sesion sea uno de los permitidos.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "No autenticado" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "No autorizado" });
    }
    next();
  };
}

// Para rutas /studios/:id... : verifica que el estudio pertenezca al dueño
// de la sesion. Un admin pasa siempre.
function requireStudioOwner(paramName = "id") {
  return async (req, res, next) => {
    try {
      if (req.user.role === "admin") return next();
      if (req.user.role !== "owner") {
        return res.status(403).json({ error: "No autorizado" });
      }

      const studioId = req.params[paramName];
      const { rows } = await pool.query(
        "SELECT 1 FROM studios WHERE id = $1 AND owner_id = $2",
        [studioId, req.user.id],
      );
      if (rows.length === 0) {
        return res.status(403).json({ error: "No autorizado" });
      }
      next();
    } catch (err) {
      console.error("Error al verificar el dueño del estudio:", err);
      res.status(500).json({ error: "Error del servidor" });
    }
  };
}

module.exports = { requireAuth, requireRole, requireStudioOwner };
