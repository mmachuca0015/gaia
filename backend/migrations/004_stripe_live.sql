-- Corte de Stripe de modo prueba a modo live.
--
-- Los ids de Stripe (cus_, acct_, prod_, price_, sub_) pertenecen a UNA cuenta
-- y UN modo. Los que se crearon probando no existen con la llave live, y no hay
-- forma de distinguirlos mirando el texto: un cus_ de prueba y uno real se ven
-- igual. Asi que lo unico seguro es borrarlos todos de una vez, en el momento
-- del corte, y dejar que la app los vuelva a crear contra la cuenta real.
--
-- Que implica para la gente:
--   - los usuarios vuelven a guardar su tarjeta (el metodo de pago vivia en la
--     cuenta de Stripe de prueba, no se puede mover);
--   - los dueños repiten el alta de Stripe Connect;
--   - los planes se vuelven a crear en Stripe solos, en el primer cobro.
--
-- IMPORTANTE: esta migracion corre UNA sola vez.
--
-- run.js aplica todos los .sql en cada despliegue. Sin el candado de abajo,
-- cada deploy borraria los ids REALES de produccion: cada cliente perderia su
-- tarjeta y cada estudio su cuenta de cobro. El candado es una tabla marca que
-- se escribe dentro de la misma transaccion que el borrado.

CREATE TABLE IF NOT EXISTS stripe_cutover (
  -- Una sola fila posible: el CHECK sobre la PK impide que haya una segunda.
  id         BOOLEAN     PRIMARY KEY DEFAULT TRUE CHECK (id),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM stripe_cutover) THEN
    RAISE NOTICE 'Corte a Stripe live ya aplicado, no se toca nada.';
    RETURN;
  END IF;

  -- Planes: product y prices se regeneran solos en ensureStripePrice.
  UPDATE plans
     SET stripe_product_id    = NULL,
         stripe_price_id      = NULL,
         stripe_price_id_year = NULL,
         updated_at           = NOW()
   WHERE stripe_product_id    IS NOT NULL
      OR stripe_price_id      IS NOT NULL
      OR stripe_price_id_year IS NOT NULL;

  -- Suscripciones de dueños.
  --
  -- El status vuelve a 'pendiente' junto con los ids. Dejarlo en 'activa' seria
  -- lo peor de los dos mundos: el dueño nunca pago de verdad, pero /payment-intent
  -- responde 409 "ya esta activa", asi que se quedaria con el panel abierto y sin
  -- ninguna manera de pagar. Volviendo a 'pendiente' se le cobra como al resto.
  UPDATE subscriptions
     SET stripe_customer_id     = NULL,
         stripe_subscription_id = NULL,
         current_period_end     = NULL,
         status                 = 'pendiente',
         updated_at             = NOW()
   WHERE stripe_customer_id IS NOT NULL
      OR stripe_subscription_id IS NOT NULL;

  -- Tarjetas guardadas de los clientes.
  UPDATE users
     SET stripe_customer_id = NULL
   WHERE stripe_customer_id IS NOT NULL;

  -- Cuentas Connect de los estudios. Al quedar en NULL, el panel del dueño
  -- vuelve a mostrar el alta de cobros.
  UPDATE studios
     SET stripe_account_id = NULL
   WHERE stripe_account_id IS NOT NULL;

  INSERT INTO stripe_cutover DEFAULT VALUES;
  RAISE NOTICE 'Corte a Stripe live aplicado.';
END $$;
