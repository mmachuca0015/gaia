-- Los avisos son una caracteristica del plan, no de todos los estudios.
--
-- Se guarda como columna y no como una fila de `plan_features` por lo mismo
-- que las sucursales (migración 013): la fila es texto que lee el cliente, la
-- columna es lo que aplica el backend. Con la fila sola, el admin no tenia
-- forma de dar o quitar la funcion, y el texto se quedaba viejo.
--
-- Arranca apagada para todos y se prende donde toca abajo. Un plan nuevo que
-- el admin cree no manda avisos hasta que lo diga.
ALTER TABLE plans ADD COLUMN IF NOT EXISTS notices BOOLEAN NOT NULL DEFAULT false;

-- Mismo candado que la 008, la 012 y la 013: run.js corre todos los .sql en
-- cada despliegue, y sin esto cada deploy volveria a prender los avisos de Pro
-- aunque el admin los haya apagado a proposito.
CREATE TABLE IF NOT EXISTS data_migrations (
  name       TEXT        PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM data_migrations WHERE name = 'avisos_plan_pro') THEN
    RAISE NOTICE 'Los avisos del plan Pro ya se configuraron.';
    RETURN;
  END IF;

  -- Pro si, Basic (slug 'light') no. Es lo que ya prometia la landing.
  UPDATE plans SET notices = TRUE,  updated_at = NOW() WHERE slug = 'pro';
  UPDATE plans SET notices = FALSE, updated_at = NOW() WHERE slug = 'light';

  -- La 008 dejo escrita a mano "Envío de avisos por la plataforma" en Pro.
  -- Ahora esa linea la arma el cliente con la columna (`noticesFeature` en
  -- src/lib/plans.ts), asi que la de antes sobra y saldria duplicada.
  DELETE FROM plan_features WHERE label ILIKE '%avisos%';

  INSERT INTO data_migrations (name) VALUES ('avisos_plan_pro');
END $$;
