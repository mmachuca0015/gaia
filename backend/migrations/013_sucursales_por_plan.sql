-- Las sucursales incluidas dejan de ser texto suelto.
--
-- Hasta ahora el numero se decia dos veces: `plans.max_studios`, que es el que
-- aplica el backend, y una fila de `plan_features` escrita a mano ("1
-- sucursal", "Hasta 3 sucursales") que es la que leia el cliente. Nada
-- obligaba a que coincidieran: cambiar el limite desde el admin dejaba a la
-- landing prometiendo otra cosa.
--
-- Ahora la landing, el registro y el admin arman esa linea con
-- `plans.max_studios` (ver `branchesFeature` en src/lib/plans.ts), asi que las
-- filas viejas sobran y saldrian duplicadas.
--
-- Mismo candado que la 008 y la 012: run.js corre todos los .sql en cada
-- despliegue, y sin el, cada deploy volveria a borrar la caracteristica que el
-- admin haya escrito despues a proposito.

CREATE TABLE IF NOT EXISTS data_migrations (
  name       TEXT        PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM data_migrations WHERE name = 'sucursales_feature') THEN
    RAISE NOTICE 'La linea de sucursales ya se quito de plan_features.';
    RETURN;
  END IF;

  DELETE FROM plan_features WHERE label ILIKE '%sucursal%';

  INSERT INTO data_migrations (name) VALUES ('sucursales_feature');
END $$;

-- El limite nunca puede ser cero: un plan de cero sucursales dejaria al dueño
-- con la cuenta pagada y nada que administrar. El admin ya lo valida, esto es
-- la red de abajo.
ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_max_studios_positivo;
ALTER TABLE plans ADD CONSTRAINT plans_max_studios_positivo
  CHECK (max_studios >= 1);
