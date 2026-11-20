-- Reembolso de una clase suelta desde /admin/clases-pagadas.
--
-- Hasta ahora `refunds` solo lo escribia el cierre de un estudio
-- (services/closure.js). Ahora tambien soporte, renglon por renglon, cuando
-- hay un problema con el estudio. Se reusa la tabla y no se hace otra: su
-- UNIQUE por reserva es lo que impide devolver dos veces, y tiene que valer
-- para los dos caminos (un estudio que cierra despues de que soporte ya
-- devolvio una clase no la debe devolver otra vez).

-- Quien lo pidio y por que. NULL en los del cierre, que no los pide nadie.
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS admin_id INTEGER
  REFERENCES admins (id) ON DELETE SET NULL;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS reason TEXT
  CHECK (reason IS NULL OR char_length(reason) <= 500);

-- Lo que se le recupero al estudio. En el cierre es la reversion proporcional
-- de Stripe; en el de soporte es TODO lo que el estudio recibio por esa
-- reserva, porque el problema fue suyo. Sirve para cuadrar contra Stripe.
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS recovered_cents INTEGER;

-- 'en_proceso': el renglon se aparta ANTES de hablar con Stripe, asi un doble
-- clic o dos admins a la vez chocan con el UNIQUE en vez de devolver dos
-- veces. Si el servidor se cae a la mitad, se queda asi y el reintento sigue
-- con las mismas llaves de idempotencia de Stripe.
ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_status_check;
ALTER TABLE refunds ADD CONSTRAINT refunds_status_check
  CHECK (status IN ('hecho', 'sin_cargo', 'sin_fondos', 'en_proceso'));
