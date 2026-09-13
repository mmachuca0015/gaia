-- Planes de suscripcion para dueños de estudio.
--
-- Los precios viven aqui, no en el codigo: la landing y el paso de registro
-- los leen de la API, asi que cambiar un precio en el panel de admin actualiza
-- las dos vistas sin volver a desplegar.
--
-- El precio se guarda en centavos y como entero. Con NUMERIC o float, $199.00
-- termina siendo 198.99999 tarde o temprano, y Stripe tambien cobra en
-- centavos, asi que no hay conversion que se pueda equivocar.

CREATE TABLE IF NOT EXISTS plans (
  id                SERIAL PRIMARY KEY,
  slug              TEXT        NOT NULL UNIQUE,
  name              TEXT        NOT NULL,
  tagline           TEXT,
  price_cents       INTEGER     NOT NULL CHECK (price_cents >= 0),
  currency          TEXT        NOT NULL DEFAULT 'mxn',
  -- Descuento de bienvenida, aplicado solo al primer cobro.
  intro_discount    INTEGER     NOT NULL DEFAULT 50
                                CHECK (intro_discount BETWEEN 0 AND 100),
  is_featured       BOOLEAN     NOT NULL DEFAULT FALSE,
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order        INTEGER     NOT NULL DEFAULT 0,
  -- Se llenan la primera vez que el plan se cobra. El price de Stripe es
  -- inmutable: al cambiar el precio se crea uno nuevo y se reemplaza aqui.
  stripe_product_id TEXT,
  stripe_price_id   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Las caracteristicas son filas, no un array ni un JSON, porque el admin las
-- agrega y quita de una en una.
CREATE TABLE IF NOT EXISTS plan_features (
  id         SERIAL PRIMARY KEY,
  plan_id    INTEGER NOT NULL REFERENCES plans (id) ON DELETE CASCADE,
  label      TEXT    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS plan_features_plan_idx
  ON plan_features (plan_id, sort_order);

-- Una suscripcion por dueño. El estado lo manda Stripe via webhook, no el
-- cliente: el navegador puede volver de Checkout sin que el pago haya
-- cerrado, y al reves el pago puede confirmarse aunque el usuario cierre la
-- pestaña.
CREATE TABLE IF NOT EXISTS subscriptions (
  id                     SERIAL PRIMARY KEY,
  owner_id               INTEGER     NOT NULL UNIQUE
                                     REFERENCES studio_owners (id) ON DELETE CASCADE,
  plan_id                INTEGER     NOT NULL REFERENCES plans (id),
  status                 TEXT        NOT NULL DEFAULT 'pendiente'
                                     CHECK (status IN ('pendiente', 'activa', 'vencida', 'cancelada')),
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT UNIQUE,
  current_period_end     TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscriptions_owner_idx  ON subscriptions (owner_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions (status);

-- Planes iniciales. ON CONFLICT DO NOTHING para que la migracion se pueda
-- volver a correr sin pisar los precios que el admin haya cambiado despues:
-- en Render esto corre en cada despliegue.
INSERT INTO plans (slug, name, tagline, price_cents, is_featured, sort_order)
VALUES
  ('light', 'Light', 'Para estudios que empiezan a llenar su agenda.', 19900, FALSE, 1),
  ('pro',   'Pro',   'Para estudios con varias clases al dia y equipo completo.', 39900, TRUE, 2)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO plan_features (plan_id, label, sort_order)
SELECT p.id, f.label, f.sort_order
FROM plans p
JOIN (VALUES
  ('light', 'Perfil en el marketplace',              1),
  ('light', 'Hasta 3 instructores',                  2),
  ('light', 'Agenda y reservaciones ilimitadas',     3),
  ('light', 'Cobros con Stripe Connect',             4),
  ('light', 'Confirmaciones por correo',             5),
  ('light', 'Panel de ingresos basico',              6),
  ('pro',   'Todo lo de Light',                      1),
  ('pro',   'Instructores ilimitados',               2),
  ('pro',   'Graficas de ingresos por periodo',      3),
  ('pro',   'Actividad reciente en tiempo real',     4),
  ('pro',   'Posicion destacada en el marketplace',  5),
  ('pro',   'Galeria de fotos ampliada',             6),
  ('pro',   'Soporte prioritario',                   7)
) AS f (slug, label, sort_order) ON f.slug = p.slug
WHERE NOT EXISTS (SELECT 1 FROM plan_features WHERE plan_id = p.id);
