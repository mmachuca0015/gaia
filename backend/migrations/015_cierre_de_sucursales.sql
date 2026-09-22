-- Que pasa con los alumnos cuando una sucursal deja de operar.
--
-- Dos caminos distintos, y la diferencia es si al dueño le queda sucursal:
--
--   BAJAR DE PLAN. Sobrevive al menos una. Las clases sueltas que el alumno ya
--   pago en las sucursales que se duermen se le abonan como clases GRATIS en
--   la que queda. No se le devuelve dinero porque no lo perdio: se le mueve.
--
--   CANCELAR. No sobrevive ninguna. Ahi si se le devuelve el dinero, y lo pone
--   el estudio.

-- 1. Una reserva no sabia con que cargo se pago.
--
-- Sin esto una clase suelta no se puede reembolsar: no hay forma de llegar al
-- cargo de Stripe desde la reserva (los paquetes si lo guardaban). Se guarda
-- tambien el desglose porque los precios de `classes` cambian, y hay que
-- devolver lo que se cobro, no lo que cuesta hoy.
--
-- Las reservas de ANTES de esta migracion se quedan en NULL y no se pueden
-- reembolsar solas: esas salen en el Excel que se le manda al admin para
-- resolverlas a mano.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS price_cents INTEGER;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS service_fee_cents INTEGER;

-- 2. Clases a favor: un paquete que nadie compro.
--
-- Un abono se guarda como una compra de paquete con `package_id` NULL y precio
-- cero. Reusa entero lo que ya existe (canje con FOR UPDATE, vencimiento,
-- "Mis paquetes") en vez de una tabla nueva con su propia mecanica a medias.
--
-- `origin_studio_id` es la sucursal que cerro, para poder decirle al alumno de
-- donde salieron sus clases.
ALTER TABLE package_purchases ALTER COLUMN package_id DROP NOT NULL;
ALTER TABLE package_purchases
  ADD COLUMN IF NOT EXISTS origin_studio_id INTEGER REFERENCES studios (id);

-- Un abono no es una venta: no cuenta como ingreso ni como actividad.
COMMENT ON COLUMN package_purchases.package_id IS
  'NULL = clases a favor por el cierre de una sucursal, no una venta.';

-- 3. Bitacora de devoluciones.
--
-- Existe para no devolver dos veces. Stripe reintenta los webhooks, y
-- `customer.subscription.deleted` puede llegar repetido: sin el UNIQUE, el
-- segundo intento le devolveria el dinero al alumno otra vez, esta vez del
-- bolsillo del estudio sin que nadie lo note.
--
-- `status` distingue por que no salio una devolucion:
--   hecho       -> Stripe la acepto
--   sin_cargo   -> reserva vieja sin PaymentIntent: va al Excel del admin
--   sin_fondos  -> la cuenta del estudio no tenia saldo: va al Excel del admin
CREATE TABLE IF NOT EXISTS refunds (
  id               SERIAL      PRIMARY KEY,
  kind             TEXT        NOT NULL CHECK (kind IN ('reserva', 'paquete')),
  booking_id       INTEGER     REFERENCES bookings (id) ON DELETE CASCADE,
  purchase_id      INTEGER     REFERENCES package_purchases (id) ON DELETE CASCADE,
  user_id          INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  studio_id        INTEGER     REFERENCES studios (id) ON DELETE SET NULL,
  amount_cents     INTEGER     NOT NULL,
  stripe_refund_id TEXT,
  status           TEXT        NOT NULL
                               CHECK (status IN ('hecho', 'sin_cargo', 'sin_fondos')),
  error            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Una reserva y una compra se devuelven UNA vez.
  CONSTRAINT refunds_una_por_reserva UNIQUE (booking_id),
  CONSTRAINT refunds_una_por_compra  UNIQUE (purchase_id)
);

CREATE INDEX IF NOT EXISTS refunds_studio_idx ON refunds (studio_id, created_at DESC);
