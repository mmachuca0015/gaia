const express = require("express");
const cors = require("cors");
require("dotenv").config();

const studiosRouter = require("./routes/studios");
const bookingsRouter = require("./routes/bookings");
const userRouter = require("./routes/users");
const paymentsRouter = require("./routes/payments");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/studios", studiosRouter);
app.use("/bookings", bookingsRouter);
app.use("/users", userRouter);
app.use("/payments", paymentsRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

const cron = require("node-cron");

// Corre cada hora
cron.schedule("0 * * * *", async () => {
  try {
    await pool.query(`
      UPDATE bookings SET status = 'pasada'
      WHERE status = 'activa'
      AND schedule_id IN (
        SELECT schedules.id FROM schedules
        WHERE schedules.day = EXTRACT(DOW FROM NOW())
        AND schedules.time < NOW()::time
      )
    `);
    console.log("Bookings actualizadas");
  } catch (err) {
    console.error("Error en cron:", err);
  }
});
