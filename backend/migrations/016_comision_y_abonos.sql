-- Dos cosas que faltaban del cierre de sucursales.
--
-- 1. Cuanto se lleva Stripe de cada devolucion.
--
-- Hoy lo absorbe Wellco: al alumno se le devuelve el precio de la clase, pero
-- de la cuenta del estudio solo se puede recuperar lo que ese estudio recibio,
-- que ya venia sin la comision de Stripe. La diferencia la pone la plataforma.
--
-- Se guarda para poder medirlo, y para que cambiarlo a que lo pague el estudio
-- sea mover una regla y no reconstruir el historial:
--
--   SELECT SUM(stripe_fee_cents)/100.0 AS absorbido_por_wellco
--     FROM refunds WHERE status = 'hecho';
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS stripe_fee_cents INTEGER NOT NULL DEFAULT 0;

-- 2. Un abono vale lo que el alumno pago por esa clase.
--
-- Antes un abono era "una clase gratis" sin mas. Ahora lleva su valor, porque
-- el alumno lo canjea en otra sucursal y ahi las clases pueden costar
-- distinto: si la que elige es mas cara, paga la diferencia.
--
-- El valor vive en `price_cents` de la compra, que ya existia. Lo que hacia
-- falta era que cada abono fuera de UNA clase, para que el valor sea exacto y
-- no un promedio: `price_cents / classes_total` con classes_total = 1.
COMMENT ON COLUMN package_purchases.price_cents IS
  'Precio pagado. En un abono por cierre (package_id NULL) es lo que el alumno pago por esa clase, y es contra lo que se calcula la diferencia al canjearlo.';
