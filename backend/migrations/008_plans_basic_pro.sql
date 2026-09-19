-- Catalogo de planes de septiembre 2026: Basic ($499 + IVA) y Pro ($1,099 + IVA).
--
-- Los precios se guardan SIN IVA. El 16% lo agrega Stripe como impuesto en
-- cada factura (ver ensureIvaTaxRate en services/stripePlans.js), asi que el
-- recibo muestra subtotal + IVA en vez de un precio inflado.
--
-- IMPORTANTE: corre UNA sola vez.
--
-- run.js aplica todos los .sql en cada despliegue. Sin el candado, cada deploy
-- regresaria precios y caracteristicas a estos valores y borraria lo que el
-- admin haya cambiado despues en /admin/suscripciones.
--
-- El slug 'light' NO se cambia aunque el plan ahora se llame Basic: la 002
-- inserta 'light' con ON CONFLICT (slug) DO NOTHING en cada despliegue, y con
-- otro slug volveria a aparecer un plan Light fantasma.

CREATE TABLE IF NOT EXISTS data_migrations (
  name       TEXT        PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM data_migrations WHERE name = 'plans_basic_pro') THEN
    RAISE NOTICE 'Planes Basic/Pro ya aplicados, no se toca nada.';
    RETURN;
  END IF;

  UPDATE plans
     SET name = 'Basic', price_cents = 49900, updated_at = NOW()
   WHERE slug = 'light';

  UPDATE plans
     SET price_cents = 109900, updated_at = NOW()
   WHERE slug = 'pro';

  DELETE FROM plan_features
   WHERE plan_id IN (SELECT id FROM plans WHERE slug IN ('light', 'pro'));

  INSERT INTO plan_features (plan_id, label, sort_order)
  SELECT p.id, f.label, f.sort_order
  FROM plans p
  JOIN (VALUES
    ('light', 'Reservas y cobros en línea ilimitados', 1),
    ('light', 'Estudio en el marketplace',             2),
    ('light', 'Confirmaciones por correo',             3),
    ('light', 'Alumnos ilimitados',                    4),
    ('light', 'Control de asistencia por clase',       5),
    ('light', 'Calendario',                            6),
    ('light', 'Dashboard con estadísticas',            7),
    ('light', 'Instructores ilimitados',               8),
    ('light', 'Pagos seguros con Stripe Connect',      9),
    ('light', '1 sucursal',                           10),
    ('light', 'Creación de paquetes',                 11),
    ('pro',   'Todo lo del plan Basic',                1),
    ('pro',   'Hasta 3 sucursales',                    2),
    ('pro',   'Envío de avisos por la plataforma',     3)
  ) AS f (slug, label, sort_order) ON f.slug = p.slug;

  INSERT INTO data_migrations (name) VALUES ('plans_basic_pro');
END $$;
