const express = require("express");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// Arma los planes con sus caracteristicas en una sola consulta. Traerlas
// aparte y unirlas en JavaScript costaba una consulta por plan.
const PLANS_QUERY = `
  SELECT
    p.id, p.slug, p.name, p.tagline, p.price_cents, p.currency,
    p.intro_discount, p.annual_discount, p.is_featured, p.is_active, p.sort_order,
    -- Cuantas sucursales incluye el plan. Va aqui y no como una linea escrita
    -- a mano en plan_features porque es el MISMO numero que aplica el
    -- backend: asi la landing no puede prometer tres y el panel dar una.
    p.max_studios,
    -- Si el plan incluye mandar avisos a los alumnos. Misma razon que
    -- max_studios: es lo que aplica el backend, no una linea escrita a mano.
    p.notices,
    -- El total anual se calcula aqui y no en el cliente: es el mismo numero
    -- que se le manda a Stripe, asi que no puede diferir del que se cobra.
    ROUND(p.price_cents * 12 * (100 - p.annual_discount) / 100.0)::int
      AS annual_price_cents,
    COALESCE(
      (
        SELECT json_agg(json_build_object('id', f.id, 'label', f.label)
                        ORDER BY f.sort_order, f.id)
        FROM plan_features f
        WHERE f.plan_id = p.id
      ),
      '[]'::json
    ) AS features
  FROM plans p
`;

// Publico: lo consumen la landing y el paso de plan en el registro. Solo
// planes activos y sin exponer los ids de Stripe.
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `${PLANS_QUERY} WHERE p.is_active = TRUE ORDER BY p.sort_order, p.id`,
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener los planes" });
  }
});

// De aqui en adelante todo es del admin.
router.use(requireAuth, requireRole("admin"));

router.get("/all", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `${PLANS_QUERY} ORDER BY p.sort_order, p.id`,
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener los planes" });
  }
});

// El precio llega en pesos desde el formulario y se guarda en centavos.
// Math.round evita que 199.1 se convierta en 19909.999999999996.
function toCents(pesos) {
  const n = Number(pesos);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

// Cuantas sucursales incluye un plan. Entero de 1 en adelante: un plan de
// cero sucursales no le serviria a nadie. El tope evita un dedazo (un 30 en
// vez de un 3) que publicaria sucursales que el dueño no contrato.
const MAX_STUDIOS_TOPE = 20;

function toBranchLimit(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > MAX_STUDIOS_TOPE) return null;
  return n;
}

router.post("/", async (req, res) => {
  const {
    slug,
    name,
    tagline,
    price,
    intro_discount,
    is_featured,
    max_studios,
    notices,
  } = req.body;
  const priceCents = toCents(price);

  if (!slug || !name || priceCents === null) {
    return res
      .status(400)
      .json({ error: "Faltan el identificador, el nombre o el precio" });
  }

  let branchLimit = 1;
  if (max_studios !== undefined) {
    branchLimit = toBranchLimit(max_studios);
    if (branchLimit === null) {
      return res.status(400).json({
        error: `Las sucursales incluidas van de 1 a ${MAX_STUDIOS_TOPE}`,
      });
    }
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO plans (slug, name, tagline, price_cents, intro_discount, is_featured, max_studios, notices, sort_order)
       VALUES ($1, $2, $3, $4, COALESCE($5, 50), COALESCE($6, FALSE), $7, COALESCE($8, FALSE),
               COALESCE((SELECT MAX(sort_order) + 1 FROM plans), 1))
       RETURNING id`,
      [
        String(slug).trim().toLowerCase(),
        name,
        tagline || null,
        priceCents,
        intro_discount,
        is_featured,
        branchLimit,
        notices === undefined ? null : Boolean(notices),
      ],
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Ya existe un plan con ese identificador" });
    }
    console.error(err);
    res.status(500).json({ error: "Error al crear el plan" });
  }
});

router.patch("/:id", async (req, res) => {
  const {
    name,
    tagline,
    price,
    intro_discount,
    annual_discount,
    is_featured,
    is_active,
    max_studios,
    notices,
  } = req.body;

  // Solo se tocan los campos que vienen en el cuerpo: el formulario del admin
  // manda un campo a la vez y un UPDATE fijo borraria los demas.
  const sets = [];
  const values = [];
  const push = (col, val) => {
    values.push(val);
    sets.push(`${col} = $${values.length}`);
  };

  if (name !== undefined) push("name", name);
  if (tagline !== undefined) push("tagline", tagline || null);
  if (is_featured !== undefined) push("is_featured", Boolean(is_featured));
  if (is_active !== undefined) push("is_active", Boolean(is_active));
  // Apagar los avisos no borra los que ya se mandaron: el alumno los sigue
  // viendo hasta que caduquen, y el dueño deja de tener la pestaña.
  if (notices !== undefined) push("notices", Boolean(notices));

  if (price !== undefined) {
    const priceCents = toCents(price);
    if (priceCents === null) {
      return res.status(400).json({ error: "Precio invalido" });
    }
    push("price_cents", priceCents);
  }

  for (const [field, value] of [
    ["intro_discount", intro_discount],
    ["annual_discount", annual_discount],
  ]) {
    if (value === undefined) continue;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 100) {
      return res.status(400).json({ error: "El descuento debe ir de 0 a 100" });
    }
    push(field, n);
  }

  // Bajar las sucursales de un plan no borra nada: las sucursales que dejan de
  // caber se duermen (salen del catalogo, el dueño ya no las administra) y
  // vuelven solas si el numero sube otra vez. El catalogo lo calcula en cada
  // consulta, asi que el cambio surte efecto al guardarlo.
  if (max_studios !== undefined) {
    const branchLimit = toBranchLimit(max_studios);
    if (branchLimit === null) {
      return res.status(400).json({
        error: `Las sucursales incluidas van de 1 a ${MAX_STUDIOS_TOPE}`,
      });
    }
    push("max_studios", branchLimit);
  }

  if (sets.length === 0) {
    return res.status(400).json({ error: "Nada que actualizar" });
  }

  values.push(req.params.id);

  try {
    const { rowCount } = await pool.query(
      `UPDATE plans SET ${sets.join(", ")}, updated_at = NOW()
       WHERE id = $${values.length}`,
      values,
    );
    if (rowCount === 0) return res.status(404).json({ error: "Plan no encontrado" });
    // El Price de Stripe no se toca aqui. Se regenera en el siguiente checkout,
    // cuando ensureStripePrice detecta que el monto ya no coincide; asi un
    // ajuste de precio no dispara llamadas a Stripe desde el panel.
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar el plan" });
  }
});

// Un plan con suscripciones no se borra: se desactiva. Borrarlo dejaria
// suscripciones apuntando a un plan inexistente.
router.delete("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS total FROM subscriptions WHERE plan_id = $1",
      [req.params.id],
    );
    if (rows[0].total > 0) {
      await pool.query(
        "UPDATE plans SET is_active = FALSE, updated_at = NOW() WHERE id = $1",
        [req.params.id],
      );
      return res.json({ ok: true, deactivated: true, subscriptions: rows[0].total });
    }
    const { rowCount } = await pool.query("DELETE FROM plans WHERE id = $1", [
      req.params.id,
    ]);
    if (rowCount === 0) return res.status(404).json({ error: "Plan no encontrado" });
    res.json({ ok: true, deactivated: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al eliminar el plan" });
  }
});

router.post("/:id/features", async (req, res) => {
  const { label } = req.body;
  if (!label || !String(label).trim()) {
    return res.status(400).json({ error: "La caracteristica no puede ir vacia" });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO plan_features (plan_id, label, sort_order)
       VALUES ($1, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM plan_features WHERE plan_id = $1), 1))
       RETURNING id, label`,
      [req.params.id, String(label).trim()],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23503") {
      return res.status(404).json({ error: "Plan no encontrado" });
    }
    console.error(err);
    res.status(500).json({ error: "Error al agregar la caracteristica" });
  }
});

router.patch("/:id/features/:featureId", async (req, res) => {
  const { label } = req.body;
  if (!label || !String(label).trim()) {
    return res.status(400).json({ error: "La caracteristica no puede ir vacia" });
  }
  try {
    // El plan_id va en el WHERE para que no se pueda editar la caracteristica
    // de otro plan pasando un featureId ajeno.
    const { rowCount } = await pool.query(
      "UPDATE plan_features SET label = $1 WHERE id = $2 AND plan_id = $3",
      [String(label).trim(), req.params.featureId, req.params.id],
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: "Caracteristica no encontrada" });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar la caracteristica" });
  }
});

router.delete("/:id/features/:featureId", async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      "DELETE FROM plan_features WHERE id = $1 AND plan_id = $2",
      [req.params.featureId, req.params.id],
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: "Caracteristica no encontrada" });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al eliminar la caracteristica" });
  }
});

module.exports = router;
