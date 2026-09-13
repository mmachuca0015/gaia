const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const studiosRouter = require("./routes/studios");
const bookingsRouter = require("./routes/bookings");
const userRouter = require("./routes/users");
const paymentsRouter = require("./routes/payments");
const adminRouter = require("./routes/admin");

const app = express();

// Detras de un proxy (Railway, Render, Fly, Nginx...) Express necesita confiar
// en X-Forwarded-* para que req.ip sea real y las cookies Secure funcionen.
app.set("trust proxy", 1);

app.use(helmet());

// El origen del frontend debe ser explicito: con credenciales (cookies) el
// navegador rechaza Access-Control-Allow-Origin: *, y un CORS abierto dejaria
// que cualquier sitio hiciera peticiones autenticadas en nombre del usuario.
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim());

app.use(
  cors({
    origin(origin, callback) {
      // Sin origin = curl, apps nativas, health checks.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      const error = new Error("Origen no permitido por CORS");
      error.status = 403;
      callback(error);
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/studios", studiosRouter);
app.use("/bookings", bookingsRouter);
app.use("/users", userRouter);
app.use("/payments", paymentsRouter);
app.use("/admin", adminRouter);

// Manejador de errores: nunca filtrar el stack al cliente.
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: "Error del servidor" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

const cron = require("node-cron");
const pool = require("./db");
const { deleteExpiredSessions } = require("./auth/sessions");

cron.schedule("0 * * * *", async () => {
  try {
    await pool.query(`
      UPDATE bookings SET status = 'pasada'
      WHERE status = 'activa'
      AND class_date < CURRENT_DATE
      OR (
        class_date = CURRENT_DATE
        AND schedule_id IN (
          SELECT id FROM schedules
          WHERE time < NOW()::time
        )
      )
    `);
    console.log("Bookings actualizadas");
  } catch (err) {
    console.error("Error en cron:", err);
  }
});

// Limpieza diaria de sesiones vencidas.
cron.schedule("0 4 * * *", async () => {
  try {
    const borradas = await deleteExpiredSessions();
    console.log(`Sesiones vencidas eliminadas: ${borradas}`);
  } catch (err) {
    console.error("Error al limpiar sesiones:", err);
  }
});
