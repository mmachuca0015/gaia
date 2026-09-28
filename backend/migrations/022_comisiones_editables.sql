-- Los porcentajes que cobra Wellco, editables desde /admin/suscripciones.
--
-- Antes eran constantes en services/charges.js y cambiarlos exigia desplegar.
-- Ahora viven aqui, como los precios de los planes, y los leen el cobro, la
-- landing, el desglose del alumno y las graficas del admin.
--
-- En puntos base (enteros): 300 = 3%, 150 = 1.5%. Nunca NUMERIC ni float,
-- por la misma razon que price_cents: nada de 1.4999999.
--
-- Una sola fila (id = 1). Cambiarlos solo mueve los cobros de ahi en
-- adelante: cada cobro guarda lo que se le cobro (service_fee_cents,
-- commission_cents), asi que el historial no se reescribe.
CREATE TABLE IF NOT EXISTS fee_settings (
  id                 INTEGER     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Cargo por servicio que paga el alumno encima del precio.
  service_fee_bp     INTEGER     NOT NULL CHECK (service_fee_bp BETWEEN 0 AND 2000),
  -- Comision que se le descuenta al estudio.
  commission_bp      INTEGER     NOT NULL CHECK (commission_bp BETWEEN 0 AND 2000),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO fee_settings (id, service_fee_bp, commission_bp)
VALUES (1, 300, 150)
ON CONFLICT (id) DO NOTHING;

-- Bitacora: quien cambio que y cuando. Nadie la lee todavia; se consulta a
-- mano, como admin_plan_changes.
CREATE TABLE IF NOT EXISTS fee_changes (
  id                  SERIAL      PRIMARY KEY,
  admin_id            INTEGER     NOT NULL REFERENCES admins (id),
  from_service_fee_bp INTEGER     NOT NULL,
  to_service_fee_bp   INTEGER     NOT NULL,
  from_commission_bp  INTEGER     NOT NULL,
  to_commission_bp    INTEGER     NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
