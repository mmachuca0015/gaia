// Paquetes de clases.
//
// `ownerRouter` se monta bajo /studios: el dueño crea, edita, desactiva y
// borra los paquetes de su estudio desde /owner/paquetes.
//
// `userRouter` se monta en /packages: el alumno ve los que estan a la venta,
// compra, consulta los suyos y reserva con ellos.
const express = require("express");
const pool = require("../db");
const {
  requireAuth,
  requireRole,
  requireStudioOwner,
} = require("../middleware/auth");
const { stripe } = require("../services/stripe");
const {
  STUDIO_PUBLISHED,
  studioVisibleTo,
  viewerIsDemo,
} = require("../services/catalog");
const {
  splitCharge,
  splitMetadata,
  studioCanReceive,
  savedCard,
} = require("../services/charges");
const {
  PACKAGE_STATUS,
  PACKAGE_ON_SALE,
  isValidValidity,
  validityInterval,
  packageChargeCents,
  usablePurchases,
} = require("../services/packages");
const { sendBookingConfirmation } = require("../services/bookingEmail");
const { lockSpot } = require("../services/spots");

const ownerRouter = express.Router();
const userRouter = express.Router();

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Clases del estudio con su instructor, para la lista del formulario.
const CLASS_OPTIONS = `
  SELECT c.id, c.name,
         COALESCE(i.name || ' ' || i.last_name, c.instructor) AS instructor
  FROM classes c
  LEFT JOIN instructors i ON i.id = c.instructor_id
  WHERE c.studio_id = $1
  ORDER BY c.name, c.id`;

// Clases de un paquete (`p`), con instructor. Tambien lo usa el catalogo.
const PACKAGE_CLASSES_JSON = `
  COALESCE(
    (SELECT json_agg(json_build_object(
              'id', c.id, 'name', c.name,
              'instructor', COALESCE(i.name || ' ' || i.last_name, c.instructor))
            ORDER BY c.name, c.id)
     FROM package_classes pc
     JOIN classes c ON c.id = pc.class_id
     LEFT JOIN instructors i ON i.id = c.instructor_id
     WHERE pc.package_id = p.id),
    '[]'::json
  )`;

// Columnas que ven el dueño y el alumno.
const PACKAGE_FIELDS = `
  p.id, p.name, p.class_count, p.price_cents, p.sale_price_cents,
  p.any_class, p.permanent_only, p.is_active,
  to_char(p.sale_starts_on, 'YYYY-MM-DD') AS sale_starts_on,
  to_char(p.sale_ends_on,   'YYYY-MM-DD') AS sale_ends_on,
  p.validity_value, p.validity_unit,
  ${PACKAGE_CLASSES_JSON} AS classes`;

// Valida y normaliza el cuerpo de crear/editar. Devuelve { error } o { data }.
function parsePackageBody(body) {
  const name = String(body.name || "").trim();
  const classCount = Number(body.class_count);
  const priceCents = Math.round(Number(body.price) * 100);
  const hasSale = body.sale_price !== null && body.sale_price !== undefined &&
    body.sale_price !== "";
  const salePriceCents = hasSale ? Math.round(Number(body.sale_price) * 100) : null;
  const anyClass = body.any_class !== false;
  const permanentOnly = body.permanent_only === true;
  const classIds = anyClass
    ? []
    : [...new Set((body.class_ids || []).map(Number))];
  const indefinite = body.indefinite !== false;
  const startsOn = indefinite ? null : body.sale_starts_on || null;
  const endsOn = indefinite ? null : body.sale_ends_on || null;
  const validityValue = Number(body.validity_value);
  const validityUnit = body.validity_unit;
  // Desactivar solo existe para los indefinidos: uno con fechas se apaga
  // solo al terminar.
  const isActive = indefinite ? body.is_active !== false : true;

  if (!name) return { error: "Ponle nombre al paquete" };
  if (!Number.isInteger(classCount) || classCount <= 0) {
    return { error: "Número de clases inválido" };
  }
  if (!Number.isFinite(priceCents) || priceCents <= 0) {
    return { error: "Precio inválido" };
  }
  if (hasSale && (!Number.isFinite(salePriceCents) || salePriceCents <= 0)) {
    return { error: "Precio con descuento inválido" };
  }
  if (hasSale && salePriceCents >= priceCents) {
    return { error: "El precio con descuento debe ser menor al precio" };
  }
  if (!anyClass && classIds.length === 0) {
    return { error: "Elige al menos una clase" };
  }
  if (!indefinite) {
    if (!ISO_DATE.test(startsOn || "") || !ISO_DATE.test(endsOn || "")) {
      return { error: "Elige inicio y fin del paquete" };
    }
    if (endsOn < startsOn) {
      return { error: "El fin del paquete no puede ser antes del inicio" };
    }
  }
  if (!isValidValidity(validityValue, validityUnit)) {
    return { error: "Elige la duración del paquete" };
  }

  return {
    data: {
      name,
      classCount,
      priceCents,
      salePriceCents,
      anyClass,
      permanentOnly,
      classIds,
      startsOn,
      endsOn,
      validityValue,
      validityUnit,
      isActive,
    },
  };
}

// Las clases elegidas tienen que ser de ESTE estudio. Sin esto, un dueño
// podria colgar de su paquete la clase de otro estudio.
async function classesBelongTo(db, studioId, classIds) {
  if (classIds.length === 0) return true;
  const { rows } = await db.query(
    "SELECT COUNT(*)::int AS n FROM classes WHERE studio_id = $1 AND id = ANY($2::int[])",
    [studioId, classIds],
  );
  return rows[0].n === classIds.length;
}

async function replaceClasses(db, packageId, classIds) {
  await db.query("DELETE FROM package_classes WHERE package_id = $1", [packageId]);
  if (classIds.length > 0) {
    await db.query(
      `INSERT INTO package_classes (package_id, class_id)
       SELECT $1, unnest($2::int[])`,
      [packageId, classIds],
    );
  }
}

ownerRouter.get(
  "/:id/packages",
  requireAuth,
  requireStudioOwner(),
  async (req, res) => {
    try {
      const [packages, classes] = await Promise.all([
        pool.query(
          `SELECT ${PACKAGE_FIELDS}, ${PACKAGE_STATUS} AS status,
                  (SELECT COUNT(*)::int FROM package_purchases pp
                   WHERE pp.package_id = p.id) AS purchases
           FROM packages p
           WHERE p.studio_id = $1 AND p.deleted_at IS NULL
           ORDER BY p.created_at DESC`,
          [req.params.id],
        ),
        pool.query(CLASS_OPTIONS, [req.params.id]),
      ]);
      res.json({ packages: packages.rows, classes: classes.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al obtener paquetes" });
    }
  },
);

ownerRouter.post(
  "/:id/packages",
  requireAuth,
  requireStudioOwner(),
  async (req, res) => {
    const studioId = Number(req.params.id);
    const { error, data } = parsePackageBody(req.body);
    if (error) return res.status(400).json({ error });

    const client = await pool.connect();
    try {
      if (!(await classesBelongTo(client, studioId, data.classIds))) {
        return res.status(400).json({ error: "Alguna clase no es de tu estudio" });
      }
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO packages
           (studio_id, name, class_count, price_cents, sale_price_cents,
            any_class, permanent_only, sale_starts_on, sale_ends_on,
            validity_value, validity_unit, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [
          studioId, data.name, data.classCount, data.priceCents,
          data.salePriceCents, data.anyClass, data.permanentOnly,
          data.startsOn, data.endsOn, data.validityValue, data.validityUnit,
          data.isActive,
        ],
      );
      await replaceClasses(client, rows[0].id, data.classIds);
      await client.query("COMMIT");
      res.json({ success: true, id: rows[0].id });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(err);
      res.status(500).json({ error: "Error al crear el paquete" });
    } finally {
      client.release();
    }
  },
);

// Editar. Solo cambia lo que se vende de aqui en adelante: las compras ya
// hechas guardan su propia copia de las condiciones.
ownerRouter.put(
  "/:id/packages/:packageId",
  requireAuth,
  requireStudioOwner(),
  async (req, res) => {
    const studioId = Number(req.params.id);
    const { error, data } = parsePackageBody(req.body);
    if (error) return res.status(400).json({ error });

    const client = await pool.connect();
    try {
      if (!(await classesBelongTo(client, studioId, data.classIds))) {
        return res.status(400).json({ error: "Alguna clase no es de tu estudio" });
      }
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE packages
         SET name = $3, class_count = $4, price_cents = $5, sale_price_cents = $6,
             any_class = $7, permanent_only = $8, sale_starts_on = $9,
             sale_ends_on = $10, validity_value = $11, validity_unit = $12,
             is_active = $13, updated_at = NOW()
         WHERE id = $1 AND studio_id = $2 AND deleted_at IS NULL`,
        [
          req.params.packageId, studioId, data.name, data.classCount,
          data.priceCents, data.salePriceCents, data.anyClass,
          data.permanentOnly, data.startsOn, data.endsOn, data.validityValue,
          data.validityUnit, data.isActive,
        ],
      );
      if (result.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Paquete no encontrado" });
      }
      await replaceClasses(client, Number(req.params.packageId), data.classIds);
      await client.query("COMMIT");
      res.json({ success: true });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(err);
      res.status(500).json({ error: "Error al guardar el paquete" });
    } finally {
      client.release();
    }
  },
);

// Borrar = marcar. Deja de venderse y desaparece del panel, pero quien ya lo
// compro lo sigue usando: su compra no depende de esta fila.
ownerRouter.delete(
  "/:id/packages/:packageId",
  requireAuth,
  requireStudioOwner(),
  async (req, res) => {
    try {
      const result = await pool.query(
        `UPDATE packages SET deleted_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND studio_id = $2 AND deleted_at IS NULL`,
        [req.params.packageId, req.params.id],
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Paquete no encontrado" });
      }
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al borrar el paquete" });
    }
  },
);

// --- Alumno

// Paquetes a la venta hoy de un estudio (pestaña "Paquetes" de su pagina),
// solo si este alumno puede ver el estudio: los demo solo existen para
// usuarios demo, igual que en el catalogo.
userRouter.get("/", requireAuth, requireRole("user"), async (req, res) => {
  const studioId = Number(req.query.studio_id);
  if (!studioId) return res.status(400).json({ error: "Falta el estudio" });
  try {
    const { rows } = await pool.query(
      `SELECT ${PACKAGE_FIELDS},
              studios.id AS studio_id, studios.name AS studio_name
       FROM packages p
       JOIN studios ON studios.id = p.studio_id
       WHERE p.studio_id = $2 AND ${PACKAGE_ON_SALE} AND ${studioVisibleTo("$1")}
       ORDER BY COALESCE(p.sale_price_cents, p.price_cents)`,
      [await viewerIsDemo(req.user), studioId],
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener paquetes" });
  }
});

// Paquetes que compro el alumno, con lo que le queda y cuando vence.
userRouter.get("/mine", requireAuth, requireRole("user"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT pp.id, pp.name, pp.classes_total, pp.classes_used,
              pp.classes_total - pp.classes_used AS remaining,
              pp.any_class, pp.permanent_only, pp.amount_cents, pp.expires_at,
              pp.price_cents, pp.list_price_cents, pp.validity_value,
              pp.validity_unit,
              pp.created_at, pp.expires_at < NOW() AS expired,
              studios.id AS studio_id, studios.name AS studio_name,
              COALESCE(
                (SELECT json_agg(json_build_object(
                          'id', c.id, 'name', c.name,
                          'instructor', COALESCE(i.name || ' ' || i.last_name, c.instructor))
                        ORDER BY c.name, c.id)
                 FROM package_purchase_classes ppc
                 JOIN classes c ON c.id = ppc.class_id
                 LEFT JOIN instructors i ON i.id = c.instructor_id
                 WHERE ppc.purchase_id = pp.id),
                '[]'::json
              ) AS classes
       FROM package_purchases pp
       JOIN studios ON studios.id = pp.studio_id
       WHERE pp.user_id = $1
         -- Uno que ya no sirve (vencido o sin clases) se sigue mostrando,
         -- opaco, solo 3 meses despues de que termino: al vencer, o al
         -- canjear su ultima clase si se acabo antes.
         AND (
           (pp.expires_at > NOW() AND pp.classes_used < pp.classes_total)
           OR CASE
                WHEN pp.classes_used >= pp.classes_total THEN COALESCE(
                  (SELECT MAX(b.created_at) FROM bookings b
                   WHERE b.package_purchase_id = pp.id),
                  pp.expires_at)
                ELSE pp.expires_at
              END > NOW() - INTERVAL '3 months'
         )
       ORDER BY (pp.expires_at < NOW() OR pp.classes_used >= pp.classes_total),
                pp.expires_at`,
      [req.user.id],
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener tus paquetes" });
  }
});

// Comprar un paquete. El precio, las condiciones y el estudio salen de la
// base, nunca del body: el alumno solo dice cual.
userRouter.post(
  "/:packageId/purchase",
  requireAuth,
  requireRole("user"),
  async (req, res) => {
    const userId = req.user.id;
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `SELECT p.*, ${PACKAGE_ON_SALE} AS on_sale,
                studios.stripe_account_id, studios.is_demo AS studio_is_demo,
                ${STUDIO_PUBLISHED} AS published
         FROM packages p
         JOIN studios ON studios.id = p.studio_id
         WHERE p.id = $1`,
        [req.params.packageId],
      );
      const pkg = rows[0];

      // Mismas reglas de cuentas demo que una reserva: estudio demo + usuario
      // demo = compra sin Stripe; cualquier mezcla se rechaza.
      const userIsDemo = await viewerIsDemo(req.user);
      if (!pkg || (pkg.studio_is_demo && !userIsDemo)) {
        return res.status(404).json({ error: "Paquete no encontrado" });
      }
      if (userIsDemo && !pkg.studio_is_demo) {
        return res
          .status(400)
          .json({ error: "Las cuentas demo solo pueden comprar en estudios demo" });
      }
      if (!pkg.on_sale) {
        return res.status(400).json({ error: "Este paquete ya no está a la venta" });
      }
      const simulated = pkg.studio_is_demo && userIsDemo;

      const baseCents = packageChargeCents(pkg);
      const split = splitCharge(baseCents);
      if (split.studioAmount <= 0) {
        return res
          .status(400)
          .json({ error: "El precio del paquete es demasiado bajo para cobrarse" });
      }

      let card = null;
      if (!simulated) {
        if (!pkg.published) {
          return res
            .status(400)
            .json({ error: "Este estudio ya no está vendiendo paquetes" });
        }
        if (
          !pkg.stripe_account_id ||
          !(await studioCanReceive(pkg.studio_id, pkg.stripe_account_id))
        ) {
          return res
            .status(400)
            .json({ error: "El estudio aún no puede recibir pagos" });
        }
        card = await savedCard(userId);
        if (!card) {
          return res.status(400).json({ error: "No tienes una tarjeta guardada" });
        }
      }

      // La compra se escribe en la misma transaccion que el cobro: si Stripe
      // rechaza la tarjeta, no queda un paquete regalado.
      await client.query("BEGIN");
      const purchase = await client.query(
        `INSERT INTO package_purchases
           (package_id, user_id, studio_id, name, classes_total, any_class,
            permanent_only, price_cents, service_fee_cents, amount_cents,
            expires_at, simulated, list_price_cents, validity_value,
            validity_unit)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                 NOW() + ${validityInterval(pkg.validity_value, pkg.validity_unit)},
                 $11, $12, $13, $14)
         RETURNING id, expires_at`,
        [
          pkg.id, userId, pkg.studio_id, pkg.name, pkg.class_count,
          pkg.any_class, pkg.permanent_only, baseCents, split.serviceFee,
          split.amountCents, simulated, pkg.price_cents, pkg.validity_value,
          pkg.validity_unit,
        ],
      );
      const purchaseId = purchase.rows[0].id;

      // Copia de las clases validas: si el dueño edita el paquete despues,
      // esta compra conserva las que se le confirmaron al alumno.
      await client.query(
        `INSERT INTO package_purchase_classes (purchase_id, class_id)
         SELECT $1, class_id FROM package_classes WHERE package_id = $2`,
        [purchaseId, pkg.id],
      );

      if (!simulated) {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: split.amountCents,
          currency: "mxn",
          customer: card.customerId,
          payment_method: card.paymentMethodId,
          confirm: true,
          off_session: true,
          transfer_data: {
            destination: pkg.stripe_account_id,
            amount: split.studioAmount,
          },
          metadata: {
            tipo: "paquete",
            paquete_id: String(pkg.id),
            compra_id: String(purchaseId),
            ...splitMetadata(baseCents, split),
          },
        });
        await client.query(
          "UPDATE package_purchases SET stripe_payment_intent_id = $1 WHERE id = $2",
          [paymentIntent.id, purchaseId],
        );
      }

      await client.query("COMMIT");
      res.json({
        success: true,
        purchaseId,
        expiresAt: purchase.rows[0].expires_at,
        simulated,
      });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(err);
      if (err.type === "StripeCardError") {
        return res
          .status(402)
          .json({ error: "Tu tarjeta fue rechazada. Prueba con otra." });
      }
      res.status(500).json({ error: "No pudimos completar la compra" });
    } finally {
      client.release();
    }
  },
);

// Paquetes del alumno con los que puede reservar este horario en esta fecha.
userRouter.get("/usable", requireAuth, requireRole("user"), async (req, res) => {
  const scheduleId = Number(req.query.schedule_id);
  const classDate = String(req.query.class_date || "");
  if (!scheduleId || !ISO_DATE.test(classDate)) {
    return res.status(400).json({ error: "Faltan datos de la clase" });
  }
  try {
    res.json(await usablePurchases(req.user.id, scheduleId, classDate));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener tus paquetes" });
  }
});

// Reservar una clase con un paquete: descuenta una clase, sin cobro.
userRouter.post("/redeem", requireAuth, requireRole("user"), async (req, res) => {
  const userId = req.user.id;
  const purchaseId = Number(req.body.purchaseId);
  const scheduleId = Number(req.body.scheduleId);
  const classDate = String(req.body.classDate || "");
  if (!purchaseId || !scheduleId || !ISO_DATE.test(classDate)) {
    return res.status(400).json({ error: "Faltan datos de la reserva" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Se bloquea la compra: dos reservas simultaneas no pueden gastar la
    // misma ultima clase del paquete.
    const locked = await client.query(
      "SELECT id FROM package_purchases WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [purchaseId, userId],
    );
    if (locked.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Paquete no encontrado" });
    }

    // Toda la regla (estudio, clases, tipo, vigencia, clases restantes) vive
    // en usablePurchases. Si esta compra no sale ahi, no aplica.
    const usable = await usablePurchases(userId, scheduleId, classDate, client);
    const chosen = usable.find((u) => u.id === purchaseId);
    if (!chosen) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Este paquete no se puede usar en esta clase" });
    }

    // Un estudio que dejo de publicarse no recibe reservas, tampoco con
    // paquete. Los demo se saltan la regla: solo los compra un usuario demo.
    const studio = await client.query(
      `SELECT studios.is_demo, ${STUDIO_PUBLISHED} AS published
       FROM schedules
       JOIN classes ON classes.id = schedules.class_id
       JOIN studios ON studios.id = classes.studio_id
       WHERE schedules.id = $1`,
      [scheduleId],
    );
    if (!studio.rows[0].is_demo && !studio.rows[0].published) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Este estudio ya no esta recibiendo reservas" });
    }

    // Lugar en ESA fecha (services/spots.js): bloquea el horario y cuenta
    // las reservas del dia, no un contador que se acumula entre semanas.
    const spot = await lockSpot(client, scheduleId, classDate);
    if (spot.error) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: spot.error });
    }

    const existing = await client.query(
      "SELECT id FROM bookings WHERE user_id = $1 AND schedule_id = $2 AND class_date = $3 AND status = 'activa'",
      [userId, scheduleId, classDate],
    );
    if (existing.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Ya tienes una reserva para esta clase" });
    }

    const booking = await client.query(
      `INSERT INTO bookings (user_id, schedule_id, status, class_date, package_purchase_id)
       VALUES ($1, $2, 'activa', $3, $4) RETURNING id`,
      [userId, scheduleId, classDate, purchaseId],
    );
    await client.query(
      "UPDATE package_purchases SET classes_used = classes_used + 1 WHERE id = $1",
      [purchaseId],
    );
    await client.query("COMMIT");

    const remaining = chosen.remaining - 1;
    await sendBookingConfirmation(
      booking.rows[0].id,
      `Paquete «${chosen.name}» (te ${
        remaining === 1 ? "queda 1 clase" : `quedan ${remaining} clases`
      })`,
    );

    res.json({ success: true, remaining });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "No pudimos hacer la reserva" });
  } finally {
    client.release();
  }
});

module.exports = { ownerRouter, userRouter };
