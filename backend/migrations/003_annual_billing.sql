-- Cobro anual.
--
-- El plan anual deja de ser un calculo de pantalla y pasa a ser un Price real
-- en Stripe, con su propio id. Antes la landing mostraba un precio al año que
-- nadie podia contratar.
--
-- Regla de negocio: el descuento anual y el de bienvenida NO se acumulan. Quien
-- paga al año ya recibe el 15%, asi que no se le aplica el 50% del primer mes.
-- Eso se decide en el checkout, no aqui.

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS annual_discount INTEGER NOT NULL DEFAULT 15;

-- Los CHECK no aceptan IF NOT EXISTS, asi que se consulta el catalogo antes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'plans_annual_discount_check'
  ) THEN
    ALTER TABLE plans
      ADD CONSTRAINT plans_annual_discount_check
      CHECK (annual_discount BETWEEN 0 AND 100);
  END IF;
END $$;

-- El Price anual es otro objeto en Stripe: distinto intervalo, distinto monto.
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS stripe_price_id_year TEXT;

-- Cada suscripcion recuerda como se contrato. Sin esto, al renovar no habria
-- forma de saber si toca cobrar el mes o el año.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS billing_interval TEXT NOT NULL DEFAULT 'month';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_billing_interval_check'
  ) THEN
    ALTER TABLE subscriptions
      ADD CONSTRAINT subscriptions_billing_interval_check
      CHECK (billing_interval IN ('month', 'year'));
  END IF;
END $$;
