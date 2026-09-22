const pool = require("../db");
const { COOKIE_NAME, readSession } = require("../auth/sessions");
const { STUDIO_WITHIN_PLAN } = require("../services/catalog");

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

// Para rutas publicas que muestran algo distinto con sesion (el catalogo con
// estudios demo). Deja req.user si hay sesion valida; sin ella sigue igual,
// sin responder 401.
async function optionalAuth(req, res, next) {
  try {
    const session = await readSession(req.cookies?.[COOKIE_NAME]);
    if (session) req.user = { id: session.userId, role: session.role };
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
//
// Tambien rechaza las sucursales DORMIDAS: las que ya no caben en el plan
// (un Basic que estuvo en Pro). El panel no las ofrece, pero el candado va
// aqui y no en la pantalla, porque son 20 y pico de rutas y basta con una que
// se olvide para poder seguir dando de alta clases en una sucursal que el
// alumno ya no ve. Se comprueba en el MISMO SELECT, sin un viaje extra.
//
// `allowSleeping` lo usa borrar una sucursal: esa si tiene que funcionar
// dormida, es como el dueño elige cual de las suyas se queda.
function requireStudioOwner(paramName = "id", { allowSleeping = false } = {}) {
  return async (req, res, next) => {
    try {
      if (req.user.role === "admin") return next();
      if (req.user.role !== "owner") {
        return res.status(403).json({ error: "No autorizado" });
      }

      const studioId = req.params[paramName];
      // `deleted_at IS NULL`: una sucursal borrada ya no se toca, ni para
      // editarla ni para colgarle clases.
      const { rows } = await pool.query(
        `SELECT ${STUDIO_WITHIN_PLAN} AS within_plan
           FROM studios
          WHERE studios.id = $1 AND studios.owner_id = $2
            AND studios.deleted_at IS NULL`,
        [studioId, req.user.id],
      );
      if (rows.length === 0) {
        return res.status(403).json({ error: "No autorizado" });
      }
      if (!allowSleeping && rows[0].within_plan !== true) {
        return res.status(403).json({
          error:
            "Esta sucursal no cabe en tu plan. Cambia al plan Pro para volver a administrarla.",
        });
      }
      next();
    } catch (err) {
      console.error("Error al verificar el dueño del estudio:", err);
      res.status(500).json({ error: "Error del servidor" });
    }
  };
}

module.exports = { requireAuth, optionalAuth, requireRole, requireStudioOwner };
