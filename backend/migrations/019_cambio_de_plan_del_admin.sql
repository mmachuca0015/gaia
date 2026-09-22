-- Bitacora de los cambios de plan que hace el admin.
--
-- El dueño no pidio este cambio: lo hace soporte, para ayudarlo o para
-- arreglarle una situacion. Mover lo que alguien paga sin dejar rastro de
-- quien lo movio, cuando y por que es justo lo que despues nadie puede
-- reconstruir. Nadie la lee todavia; se consulta a mano, como
-- `plan_downgrade_reasons`.
--
-- No guarda el monto: el precio del plan puede cambiar despues, y lo que se
-- cobro de verdad vive en las facturas de Stripe.
CREATE TABLE IF NOT EXISTS admin_plan_changes (
  id           SERIAL      PRIMARY KEY,
  admin_id     INTEGER     NOT NULL REFERENCES admins (id),
  owner_id     INTEGER     NOT NULL REFERENCES studio_owners (id) ON DELETE CASCADE,
  -- El plan que tenia. Se guarda aunque el admin lo desactive despues, por eso
  -- no hay ON DELETE: un plan con historial no se borra.
  from_plan_id INTEGER     REFERENCES plans (id),
  to_plan_id   INTEGER     NOT NULL REFERENCES plans (id),
  -- 'inmediato': el plan cambio al confirmar y Stripe ajusta la diferencia en
  -- el siguiente recibo. 'fin_de_periodo': entra en la renovacion, sin cobros
  -- de por medio, que es como cambia de plan el dueño.
  applies      TEXT        NOT NULL CHECK (applies IN ('inmediato', 'fin_de_periodo')),
  -- Por que se hizo. Opcional: se guarda el renglon aunque venga vacio, para
  -- saber cuantos se hicieron sin anotar el motivo.
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_plan_changes_owner_idx
  ON admin_plan_changes (owner_id, created_at DESC);
