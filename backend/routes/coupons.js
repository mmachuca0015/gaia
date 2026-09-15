const express = require("express");
const rateLimit = require("express-rate-limit");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// Duraciones y descuentos permitidos. Las listas viven aqui y no solo en el
// <select> del admin: un desplegable no valida nada, cualquiera puede mandar
// un POST con duration_months = 600.
const DURACIONES = [1, 3, 6, 12, 24];
const PORCENTAJES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

// Meses que cubre un periodo de facturacion. Se usa para decidir si un cupon
// alcanza a cubrir aunque sea un cobro completo.
const MESES_POR_PERIODO = { month: 1, year: 12 };

// Alfabeto sin caracteres que se confunden al dictar por telefono: no hay
// O/0, ni I/1, ni S/5. Un cupon se lee en voz alta a un dueño de estudio.
const ALFABETO = "ABCDEFGHJKLMNPQRTUVWXYZ23456789";
const LARGO_CODIGO = 6;

function generarCodigo() {
  let codigo = "";
  for (let i = 0; i < LARGO_CODIGO; i++) {
    codigo += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  }
  return `WELLCO-${codigo}`;
}

function etiquetaDuracion(meses) {
  if (meses === 1) return "1 mes";
  if (meses < 12) return `${meses} meses`;
  if (meses === 12) return "1 año";
  return `${meses / 12} años`;
}

// Por que un cupon corto no sirve en el plan anual:
//
// Stripe aplica el descuento a las FACTURAS que caen dentro de la ventana de
// meses, no a los meses en si. En un plan anual solo hay una factura al año, y
// cae dentro de cualquier ventana. Un cupon de "3 meses" al 100% no regalaria
// tres meses: regalaria el año entero. Asi que el cupon tiene que cubrir por
// lo menos un periodo completo.
function cubrePeriodo(durationMonths, billingInterval) {
  return durationMonths >= (MESES_POR_PERIODO[billingInterval] ?? 1);
}

// Estado de un cupon frente a un intento de canje concreto.
//
// Devuelve el motivo, no un booleano, porque el formulario de registro tiene
// que poder decir por que no sirve: no es lo mismo "no existe" que "ya se uso"
// o "sirve, pero no con el plan anual".
function revisarCupon(cupon, billingInterval) {
  if (!cupon) return { ok: false, error: "Ese cupón no existe" };
  if (cupon.redeemed_at) {
    return { ok: false, error: "Ese cupón ya fue utilizado" };
  }
  if (billingInterval && !cubrePeriodo(cupon.duration_months, billingInterval)) {
    return {
      ok: false,
      error: `Este cupón es de ${etiquetaDuracion(
        cupon.duration_months,
      )} y solo aplica al plan mensual`,
    };
  }
  return { ok: true };
}

// ------------------------------------------------------------------ admin

// Crea un cupon. El codigo lo genera el servidor: si lo eligiera el admin
// acabarian siendo adivinables (WELLCO-PRUEBA, WELLCO-2026...).
router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  const percentOff = Number(req.body.percent_off);
  const durationMonths = Number(req.body.duration_months);

  if (!PORCENTAJES.includes(percentOff)) {
    return res.status(400).json({ error: "Descuento no válido" });
  }
  if (!DURACIONES.includes(durationMonths)) {
    return res.status(400).json({ error: "Duración no válida" });
  }

  // Reintenta ante una colision de codigo en vez de fallar. Con 31^6 codigos
  // posibles es rarisimo, pero el UNIQUE de la tabla no perdona.
  for (let intento = 0; intento < 5; intento++) {
    try {
      const { rows } = await pool.query(
        `INSERT INTO coupons (code, percent_off, duration_months, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, code, percent_off, duration_months, redeemed_at, created_at`,
        [generarCodigo(), percentOff, durationMonths, req.user.id],
      );
      return res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === "23505") continue;
      console.error(err);
      return res.status(500).json({ error: "No pudimos crear el cupón" });
    }
  }

  res.status(500).json({ error: "No pudimos generar un código libre" });
});

// Cupones de los ultimos 3 meses, los nuevos primero.
router.get("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.code, c.percent_off, c.duration_months,
              c.redeemed_at, c.created_at,
              s.name AS redeemed_by_studio
       FROM coupons c
       LEFT JOIN studio_owners o ON o.id = c.redeemed_by
       LEFT JOIN studios s       ON s.owner_id = o.id
       WHERE c.created_at >= NOW() - INTERVAL '3 months'
       ORDER BY c.created_at DESC`,
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No pudimos cargar los cupones" });
  }
});

// ------------------------------------------------------------- validacion

// Limite por IP. El endpoint es publico a la fuerza (se usa antes de que
// exista la cuenta), asi que sin esto seria un oraculo para adivinar codigos
// a fuerza bruta.
const validarLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Intenta de nuevo en unos minutos." },
});

// El codigo va en el cuerpo y no en la URL: las rutas quedan escritas en los
// logs del servidor y del proxy, y un cupon sin usar es dinero.
router.post("/validate", validarLimiter, async (req, res) => {
  const code = String(req.body.code || "").trim().toUpperCase();
  const billingInterval = req.body.billing_interval;

  if (!code) return res.status(400).json({ error: "Escribe un código" });

  try {
    const { rows } = await pool.query(
      `SELECT id, code, percent_off, duration_months, redeemed_at
       FROM coupons WHERE code = $1`,
      [code],
    );

    const revision = revisarCupon(rows[0], billingInterval);
    if (!revision.ok) return res.status(404).json({ error: revision.error });

    const cupon = rows[0];
    res.json({
      code: cupon.code,
      percent_off: cupon.percent_off,
      duration_months: cupon.duration_months,
      duration_label: etiquetaDuracion(cupon.duration_months),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No pudimos validar el cupón" });
  }
});

// --------------------------------------------------------------- canje

// Canjea el cupon DENTRO de la transaccion que crea el estudio, con el
// renglon bloqueado.
//
// El bloqueo es lo que hace que "un solo uso" sea cierto: sin el, dos
// registros simultaneos con el mismo codigo leerian los dos "sin usar" y los
// dos se lo quedarian. Es el mismo patron del ultimo lugar de una clase.
//
// Recibe el client de la transaccion en curso a proposito: si el registro
// falla mas adelante, el ROLLBACK tiene que devolver tambien el cupon.
async function redeemCoupon(client, code, billingInterval, ownerId) {
  const normalizado = String(code || "").trim().toUpperCase();
  if (!normalizado) return { ok: true, couponId: null };

  const { rows } = await client.query(
    `SELECT id, code, percent_off, duration_months, redeemed_at
     FROM coupons WHERE code = $1 FOR UPDATE`,
    [normalizado],
  );

  const revision = revisarCupon(rows[0], billingInterval);
  if (!revision.ok) return revision;

  await client.query(
    "UPDATE coupons SET redeemed_by = $1, redeemed_at = NOW() WHERE id = $2",
    [ownerId, rows[0].id],
  );

  return { ok: true, couponId: rows[0].id };
}

module.exports = {
  router,
  redeemCoupon,
  etiquetaDuracion,
  DURACIONES,
  PORCENTAJES,
};
