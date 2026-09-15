-- Cupones de cortesia para cerrar estudios.
--
-- Son de UN SOLO USO y se canjean al registrar el estudio. El descuento se
-- aplica a la suscripcion del dueño durante N meses.
--
-- Por que el cupon vive aqui y no solo en Stripe: el codigo tiene que poder
-- validarse ANTES de que exista cuenta, suscripcion o customer, cuando el
-- dueño apenas lo esta escribiendo en el formulario. Consultar Stripe en ese
-- momento seria pedirle a un desconocido que nos haga llamadas a su API. El
-- Coupon de Stripe se crea despues, ya en el cobro.

CREATE TABLE IF NOT EXISTS coupons (
  id              SERIAL      PRIMARY KEY,
  -- Se dicta por telefono o se escribe en una tarjeta, asi que se guarda en
  -- mayusculas y se compara en mayusculas.
  code            TEXT        NOT NULL UNIQUE,
  percent_off     INTEGER     NOT NULL CHECK (percent_off BETWEEN 10 AND 100),
  -- Meses de descuento. La lista cerrada evita que un cupon quede con una
  -- duracion que la interfaz no sabe nombrar.
  duration_months INTEGER     NOT NULL CHECK (duration_months IN (1, 3, 6, 12, 24)),
  created_by      INTEGER     REFERENCES admins (id) ON DELETE SET NULL,
  -- Un solo uso: en cuanto estas dos columnas se llenan, el cupon esta
  -- quemado. Se guarda QUIEN lo uso, no solo que se uso, para que el mismo
  -- dueño pueda retomar su registro sin perderlo si abandona el pago.
  redeemed_by     INTEGER     REFERENCES studio_owners (id) ON DELETE SET NULL,
  redeemed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- El listado del admin es siempre "los ultimos 3 meses, los nuevos arriba".
CREATE INDEX IF NOT EXISTS coupons_created_idx ON coupons (created_at DESC);

-- La suscripcion recuerda con que cupon nacio. Sin esto, al preparar el cobro
-- no habria forma de saber que descuento aplicar, porque el codigo se escribio
-- pasos antes de llegar a Stripe.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS coupon_id INTEGER REFERENCES coupons (id);
