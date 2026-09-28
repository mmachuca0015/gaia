-- La comision que se le desconto al estudio, guardada en cada cobro.
--
-- Antes las metricas del admin la recalculaban con el porcentaje de hoy
-- (COMMISSION_PERCENT). Si el porcentaje cambia, todo el historial se
-- reescribia con el nuevo, y lo cobrado en el pasado aparecia distinto. El
-- 3% del alumno ya se guardaba (`service_fee_cents`); esto es su par.
--
-- Lo escriben /payments/charge, la compra de paquete y el canje con
-- diferencia (0 si no se cobro nada), con el mismo `splitCharge` que calculo
-- la transferencia a Stripe.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS commission_cents INTEGER;
ALTER TABLE package_purchases ADD COLUMN IF NOT EXISTS commission_cents INTEGER;

-- Lo ya cobrado se llena con el 1.5% vigente cuando se cobro. Es fijo aqui a
-- proposito: si mañana cambia el porcentaje, esto no se debe mover.
-- Las reservas anteriores a la 015 no guardaron su precio y se toman con el
-- de la clase; las de paquete sin diferencia cobrada se quedan en 0.
UPDATE bookings b
   SET commission_cents = CASE
         WHEN b.package_purchase_id IS NOT NULL
           THEN ROUND(COALESCE(b.price_cents, 0) * 1.5 / 100)
         ELSE ROUND(COALESCE(b.price_cents, c.price * 100) * 1.5 / 100)
       END
  FROM schedules s
  JOIN classes c ON c.id = s.class_id
 WHERE s.id = b.schedule_id
   AND b.commission_cents IS NULL;

-- Los abonos (package_id NULL) no son venta: 0.
UPDATE package_purchases
   SET commission_cents = CASE WHEN package_id IS NULL THEN 0
                               ELSE ROUND(price_cents * 1.5 / 100) END
 WHERE commission_cents IS NULL;
