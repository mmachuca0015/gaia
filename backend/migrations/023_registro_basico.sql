-- Registro basico de estudios y lista de lo que falta para publicarse.
--
-- El registro ya no pide estado, telefono ni horario, y el plan se puede
-- escoger despues. Lo demas se llena en el panel, y el estudio no se publica
-- hasta tener sus datos completos, su cuenta de Stripe lista y un plan pagado.

-- 1. "Escoger plan despues".
--
-- El dueño que no elige plan SI tiene fila en `subscriptions`, en 'sin_plan'
-- y con plan_id NULL. No se le deja sin fila: sin fila es un dueño heredado,
-- y a esos se les publica sin pagar y con el limite de sucursales mas alto.
ALTER TABLE subscriptions ALTER COLUMN plan_id DROP NOT NULL;

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('sin_plan', 'pendiente', 'activa', 'vencida', 'cancelada'));

-- Solo 'sin_plan' puede no tener plan.
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_requerido;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_requerido
  CHECK (plan_id IS NOT NULL OR status = 'sin_plan');

-- 2. Cuenta de Stripe lista para recibir pagos.
--
-- Si la cuenta Connect puede recibir transferencias solo lo sabe Stripe. Se
-- guarda aqui para que el catalogo lo pueda pedir en SQL (STUDIO_COMPLETE);
-- lo actualizan /payments/connect-status y cada cobro (studioCanReceive).
--
-- El relleno va dentro del IF para que correr las migraciones otra vez no
-- vuelva a marcar como listas cuentas que Stripe ya rechazo.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'studios' AND column_name = 'stripe_ready'
  ) THEN
    ALTER TABLE studios ADD COLUMN stripe_ready BOOLEAN NOT NULL DEFAULT FALSE;

    -- La cuenta Connect es del dueño, no de cada sucursal: antes solo la
    -- tenia una de sus sucursales y las demas no podian cobrar. Se copia a
    -- todas las que no tienen.
    UPDATE studios s
       SET stripe_account_id = src.stripe_account_id
      FROM (SELECT DISTINCT ON (owner_id) owner_id, stripe_account_id
              FROM studios
             WHERE stripe_account_id IS NOT NULL
             ORDER BY owner_id, created_at, id) src
     WHERE s.owner_id = src.owner_id
       AND s.stripe_account_id IS NULL;

    -- Las que ya tenian cuenta se dan por buenas para que ningun estudio
    -- publicado desaparezca del catalogo con esta migracion. Si alguna no
    -- puede cobrar, el primer cobro o la pantalla de Pagos la corrige.
    UPDATE studios SET stripe_ready = TRUE WHERE stripe_account_id IS NOT NULL;
  END IF;
END $$;
