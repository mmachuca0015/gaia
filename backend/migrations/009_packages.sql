-- Paquetes de clases que vende cada estudio (por ejemplo, "10 clases por
-- $1,200").
--
-- Un paquete limita DONDE se puede canjear, en dos ejes independientes:
--   - que clases: cualquiera del estudio (`any_class`) o solo las que estan en
--     `package_classes`;
--   - que horarios: permanentes y unicos, o solo permanentes
--     (`permanent_only`, contra `schedules.is_permanent`).
-- La regla vive en services/packages.js (packageCoversSchedule); el canje
-- debe pasar por ahi.

CREATE TABLE IF NOT EXISTS packages (
  id             SERIAL PRIMARY KEY,
  studio_id      INTEGER     NOT NULL REFERENCES studios (id) ON DELETE CASCADE,
  name           TEXT        NOT NULL,
  class_count    INTEGER     NOT NULL CHECK (class_count > 0),
  -- Centavos y entero, igual que los planes: asi cobra Stripe.
  price_cents    INTEGER     NOT NULL CHECK (price_cents > 0),
  any_class      BOOLEAN     NOT NULL DEFAULT TRUE,
  permanent_only BOOLEAN     NOT NULL DEFAULT FALSE,
  -- Un paquete no se borra, se archiva: quien ya lo compro debe poder
  -- seguir usando sus clases.
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS packages_studio_idx ON packages (studio_id);

-- Clases en las que se puede canjear un paquete con any_class = FALSE.
CREATE TABLE IF NOT EXISTS package_classes (
  package_id INTEGER NOT NULL REFERENCES packages (id) ON DELETE CASCADE,
  class_id   INTEGER NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  PRIMARY KEY (package_id, class_id)
);

-- --- Venta, precio con descuento y vigencia

-- Ventana de venta. Las dos nulas = indefinido: se vende hasta que el dueño
-- lo desactive (`is_active`). Con fechas, al pasar `sale_ends_on` el paquete
-- deja de venderse pero NO se borra: el dueño lo ve opaco y puede editarlo.
ALTER TABLE packages ADD COLUMN IF NOT EXISTS sale_starts_on DATE;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS sale_ends_on   DATE;

-- Precio con descuento, opcional. Si existe, es lo que se cobra.
ALTER TABLE packages ADD COLUMN IF NOT EXISTS sale_price_cents INTEGER
  CHECK (sale_price_cents > 0);

-- Cuanto dura el paquete DESPUES de comprarlo: 7 o 15 dias, o de 1 a 12
-- meses. Se guarda como numero + unidad porque un mes no tiene dias fijos.
ALTER TABLE packages ADD COLUMN IF NOT EXISTS validity_value INTEGER NOT NULL DEFAULT 1
  CHECK (validity_value > 0);
ALTER TABLE packages ADD COLUMN IF NOT EXISTS validity_unit TEXT NOT NULL DEFAULT 'month'
  CHECK (validity_unit IN ('day', 'month'));

-- Borrar = marcar. Desactivar (`is_active`) es otra cosa: se puede reactivar.
ALTER TABLE packages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- --- Compras
--
-- Una compra COPIA las condiciones del paquete al momento de pagar: clases,
-- vigencia, en que clases y horarios aplica. Si el dueño edita o borra el
-- paquete despues, lo que el alumno ya compro sigue valiendo tal como se lo
-- confirmamos.
CREATE TABLE IF NOT EXISTS package_purchases (
  id                SERIAL PRIMARY KEY,
  package_id        INTEGER     NOT NULL REFERENCES packages (id),
  user_id           INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  studio_id         INTEGER     NOT NULL REFERENCES studios (id) ON DELETE CASCADE,
  name              TEXT        NOT NULL,
  classes_total     INTEGER     NOT NULL CHECK (classes_total > 0),
  classes_used      INTEGER     NOT NULL DEFAULT 0
                                CHECK (classes_used BETWEEN 0 AND classes_total),
  any_class         BOOLEAN     NOT NULL,
  permanent_only    BOOLEAN     NOT NULL,
  -- Lo que costo el paquete (sin el 3%), el 3% y el total cobrado.
  price_cents       INTEGER     NOT NULL,
  service_fee_cents INTEGER     NOT NULL,
  amount_cents      INTEGER     NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  stripe_payment_intent_id TEXT,
  -- Compra de cuenta demo: no paso por Stripe.
  simulated         BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS package_purchases_user_idx
  ON package_purchases (user_id, expires_at);

CREATE TABLE IF NOT EXISTS package_purchase_classes (
  purchase_id INTEGER NOT NULL REFERENCES package_purchases (id) ON DELETE CASCADE,
  class_id    INTEGER NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  PRIMARY KEY (purchase_id, class_id)
);

-- Reserva pagada con un paquete. Nula = se pago con su propio cobro.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS package_purchase_id INTEGER
  REFERENCES package_purchases (id);

-- Lo que el alumno ve en "Mis paquetes": precio de lista (price_cents es lo
-- que pago, con el descuento si hubo) y la duracion que se le confirmo.
ALTER TABLE package_purchases ADD COLUMN IF NOT EXISTS list_price_cents INTEGER;
ALTER TABLE package_purchases ADD COLUMN IF NOT EXISTS validity_value INTEGER;
ALTER TABLE package_purchases ADD COLUMN IF NOT EXISTS validity_unit TEXT
  CHECK (validity_unit IN ('day', 'month'));
