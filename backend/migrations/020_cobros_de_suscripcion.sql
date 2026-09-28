-- Cobros de suscripcion, uno por factura pagada de Stripe.
--
-- La grafica de suscripciones del admin los necesita en la base: pedirle a
-- Stripe todas las facturas de seis meses en cada carga del panel es lento y
-- no se puede agrupar por hora de Mexico con generate_series como las demas.
--
-- Lo escribe el webhook `invoice.paid`. Las facturas de antes de esta tabla se
-- cargan con `node scripts/backfill-subscription-payments.js`.
CREATE TABLE IF NOT EXISTS subscription_payments (
  id                     SERIAL      PRIMARY KEY,
  -- UNIQUE: Stripe reintenta los webhooks, y el segundo intento no puede
  -- contar el cobro dos veces.
  stripe_invoice_id      TEXT        NOT NULL UNIQUE,
  stripe_subscription_id TEXT,
  -- Lo que es de Wellco: el plan ya con descuentos y SIN IVA. El IVA se le
  -- debe al SAT, no es ingreso.
  net_cents              INTEGER     NOT NULL,
  tax_cents              INTEGER     NOT NULL,
  -- Lo que se le cobro a la tarjeta. Puede ser menor que net + tax si Stripe
  -- aplico saldo a favor de un cambio de plan prorrateado.
  paid_cents             INTEGER     NOT NULL,
  currency               TEXT        NOT NULL DEFAULT 'mxn',
  billing_reason         TEXT,
  paid_at                TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS subscription_payments_paid_at_idx
  ON subscription_payments (paid_at);
