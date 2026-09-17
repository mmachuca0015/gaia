-- Cancelacion y cambio de plan desde el panel del dueño.
--
-- Ninguno de los dos cambios surte efecto al momento: el periodo que el dueño
-- ya pago se respeta completo. Por eso hacen falta columnas que recuerden lo
-- que va a pasar al terminar el periodo.

-- El dueño pidio cancelar. La suscripcion sigue 'activa' (y el estudio
-- publicado) hasta current_period_end; ahi Stripe la borra y el webhook la
-- pasa a 'cancelada'.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE;

-- Cambio de plan programado. En Stripe el precio ya se cambio (sin prorrateo,
-- asi que se cobra hasta la renovacion), pero plan_id sigue apuntando al plan
-- pagado hasta que entra el cobro con el precio nuevo.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS pending_plan_id INTEGER REFERENCES plans (id);

-- Primer cobro exitoso. created_at es el dia del registro, que puede ser muy
-- anterior al pago.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

UPDATE subscriptions
   SET started_at = created_at
 WHERE started_at IS NULL
   AND status = 'activa';

-- Ultimo dia cubierto por un cobro exitoso. No es lo mismo que
-- current_period_end: cuando falla una renovacion, Stripe ya avanzo el periodo
-- aunque nadie lo haya pagado. Un estudio con el pago pendiente o rechazado
-- sigue publicado solo hasta este dia.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS paid_until TIMESTAMPTZ;

UPDATE subscriptions
   SET paid_until = current_period_end
 WHERE paid_until IS NULL
   AND status = 'activa';
