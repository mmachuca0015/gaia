-- Por que un dueño se cambia a un plan mas barato.
--
-- Es lo unico que se le pregunta al bajar de plan, y solo entonces: subir de
-- plan no pregunta nada. El texto es libre y opcional; nunca detiene el
-- cambio, porque una suscripcion no se puede quedar atorada detras de una
-- encuesta.
--
-- Es un historial, no un dato de la suscripcion: un dueño puede bajar, volver
-- a subir y bajar otra vez, y cada vez cuenta por separado. Por eso es tabla y
-- no una columna de `subscriptions`.
--
-- Se guardan tambien los precios del momento porque los planes cambian de
-- precio y hasta de nombre: sin la foto, un registro de hace un año no se
-- podria leer. Misma razon por la que `package_purchases` copia lo que vendio.
-- Los planes se borran solo si nadie los contrato, asi que las llaves van
-- ON DELETE SET NULL: perder el plan no debe perder el motivo.

CREATE TABLE IF NOT EXISTS plan_downgrade_reasons (
  id               SERIAL      PRIMARY KEY,
  owner_id         INTEGER     NOT NULL REFERENCES studio_owners (id) ON DELETE CASCADE,
  from_plan_id     INTEGER     REFERENCES plans (id) ON DELETE SET NULL,
  to_plan_id       INTEGER     REFERENCES plans (id) ON DELETE SET NULL,
  from_plan_name   TEXT        NOT NULL,
  to_plan_name     TEXT        NOT NULL,
  from_price_cents INTEGER     NOT NULL,
  to_price_cents   INTEGER     NOT NULL,
  -- Libre, como lo escribio el dueño. NULL si prefirio no contestar.
  reason           TEXT        CHECK (reason IS NULL OR char_length(reason) <= 500),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS plan_downgrade_reasons_fecha_idx
  ON plan_downgrade_reasons (created_at DESC);
