// Avisos del estudio.
//
// `ownerRouter` se monta bajo /studios: el dueño escribe el aviso de una
// sucursal desde /owner/avisos y ve los del ultimo mes.
//
// `userRouter` se monta en /notificaciones: el alumno ve los avisos de los
// estudios que tiene en favoritos.
const express = require("express");
const pool = require("../db");
const {
  requireAuth,
  requireRole,
  requireStudioOwner,
} = require("../middleware/auth");
const { ownerNotices } = require("../services/catalog");
const {
  NOTICE_DAYS,
  NOTICE_MAX,
  DAILY_LIMIT,
  WINDOW,
  STUDENT_NOTICES,
  cleanBody,
} = require("../services/notices");

const ownerRouter = express.Router();
const userRouter = express.Router();

// --- Dueño -----------------------------------------------------------------

/**
 * Mandar avisos es una caracteristica del plan (`plans.notices`, hoy solo Pro).
 *
 * El candado va en el backend y no solo en el menu: esconder la pestaña evita
 * el clic, pero la ruta sigue ahi para quien escriba la URL o llame a la API.
 * Quien no lo tiene recibe 403 con `code`, para que la pantalla sepa ofrecerle
 * el cambio de plan en vez de enseñar un error suelto.
 *
 * Un admin pasa, igual que en `requireStudioOwner`: no tiene plan que revisar.
 */
async function requirePlanNotices(req, res, next) {
  try {
    if (req.user.role === "admin") return next();
    const { rows } = await pool.query(
      `SELECT ${ownerNotices("$1")} AS notices`,
      [req.user.id],
    );
    if (rows[0]?.notices !== true) {
      return res.status(403).json({
        error:
          "Mandar avisos a tus alumnos es parte del plan Pro. Cambia de plan para usarlo.",
        code: "plan_sin_avisos",
      });
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error del servidor" });
  }
}

// Los avisos del ultimo mes de una sucursal, mas lo que necesita la pantalla
// para decirle al dueño a cuantos les va a llegar y cuantos le quedan hoy.
ownerRouter.get(
  "/:id/avisos",
  requireAuth,
  requireStudioOwner(),
  requirePlanNotices,
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, body, recipients, created_at
           FROM studio_notices
          WHERE studio_id = $1 AND created_at >= NOW() - ${WINDOW}
          ORDER BY created_at DESC`,
        [req.params.id],
      );
      const { rows: cuenta } = await pool.query(
        `SELECT
           (SELECT COUNT(*) FROM favorites WHERE studio_id = $1) AS favorites,
           (SELECT COUNT(*) FROM studio_notices
             WHERE studio_id = $1 AND created_at >= NOW() - INTERVAL '24 hours'
           ) AS hoy`,
        [req.params.id],
      );
      res.json({
        notices: rows,
        favorites: Number(cuenta[0].favorites),
        // Lo que le queda del tope diario. La pantalla lo usa para avisar
        // antes de escribir, no para enterarse al recibir un 429.
        remaining_today: Math.max(DAILY_LIMIT - Number(cuenta[0].hoy), 0),
        max_length: NOTICE_MAX,
        days: NOTICE_DAYS,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al obtener los avisos" });
    }
  },
);

ownerRouter.post(
  "/:id/avisos",
  requireAuth,
  requireStudioOwner(),
  requirePlanNotices,
  async (req, res) => {
    const body = cleanBody(req.body?.body);
    if (!body) {
      return res.status(400).json({ error: "Escribe el aviso" });
    }
    if (body.length > NOTICE_MAX) {
      return res
        .status(400)
        .json({ error: `El aviso no puede pasar de ${NOTICE_MAX} caracteres` });
    }

    try {
      const { rows: hoy } = await pool.query(
        `SELECT COUNT(*)::int AS enviados
           FROM studio_notices
          WHERE studio_id = $1 AND created_at >= NOW() - INTERVAL '24 hours'`,
        [req.params.id],
      );
      if (hoy[0].enviados >= DAILY_LIMIT) {
        return res.status(429).json({
          error: `Ya mandaste ${DAILY_LIMIT} avisos en las últimas 24 horas. Espera un poco: demasiados seguidos hacen que te quiten de favoritos.`,
        });
      }

      // `recipients` se cuenta en el mismo INSERT, con los favoritos de este
      // momento: es a quienes les va a aparecer.
      const { rows } = await pool.query(
        `INSERT INTO studio_notices (studio_id, body, recipients)
         VALUES ($1, $2, (SELECT COUNT(*) FROM favorites WHERE studio_id = $1))
         RETURNING id, body, recipients, created_at`,
        [req.params.id, body],
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al mandar el aviso" });
    }
  },
);

// --- Alumno ----------------------------------------------------------------

// Los avisos de sus estudios favoritos y cuantos no ha visto (el punto rojo
// del menu). Las dos cifras salen del mismo fragmento de SQL.
userRouter.get("/", requireAuth, requireRole("user"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT n.id, n.body, n.created_at,
              s.id AS studio_id, s.name AS studio_name, s.logo_url,
              -- Nuevo = mandado despues de la ultima vez que abrio la
              -- pantalla. Sin fecha guardada (nunca ha entrado) todo es nuevo.
              n.created_at > COALESCE(
                (SELECT notices_seen_at FROM users WHERE id = $1),
                '-infinity'::timestamptz) AS unread
         ${STUDENT_NOTICES}
        ORDER BY n.created_at DESC`,
      [req.user.id],
    );
    res.json({
      notices: rows,
      unread: rows.filter((n) => n.unread).length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener las notificaciones" });
  }
});

// Solo el contador, para el punto rojo del menu. Es la misma consulta sin
// traerse los textos: el menu se pinta en todas las pantallas.
userRouter.get(
  "/unread",
  requireAuth,
  requireRole("user"),
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS unread
           ${STUDENT_NOTICES}
             AND n.created_at > COALESCE(
                   (SELECT notices_seen_at FROM users WHERE id = $1),
                   '-infinity'::timestamptz)`,
        [req.user.id],
      );
      res.json({ unread: rows[0].unread });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al obtener las notificaciones" });
    }
  },
);

// El alumno abrio la pantalla: de aqui para atras ya no hay nada nuevo.
userRouter.post(
  "/vistos",
  requireAuth,
  requireRole("user"),
  async (req, res) => {
    try {
      await pool.query(
        "UPDATE users SET notices_seen_at = NOW() WHERE id = $1",
        [req.user.id],
      );
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al marcar las notificaciones" });
    }
  },
);

module.exports = { ownerRouter, userRouter };
