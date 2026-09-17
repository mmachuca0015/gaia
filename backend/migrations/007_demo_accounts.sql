-- Cuentas demo para enseñar la app sin cobrar dinero real.
--
-- Se marcan a mano desde el panel de admin. Un estudio demo:
--   - no necesita suscripcion y nunca sale en el catalogo publico;
--   - solo lo ven (catalogo, detalle, clases) los usuarios demo.
-- Una reserva de un usuario demo en un estudio demo se crea sin pasar por
-- Stripe. Un usuario demo no puede reservar en un estudio real.

ALTER TABLE studios
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
