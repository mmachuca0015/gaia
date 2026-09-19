-- Sucursales: un dueño puede tener mas de un estudio.
--
-- La base siempre lo aguanto (studios.owner_id), lo que suponia uno solo era
-- la app. Lo que falta aqui es el limite por plan y como se llama y se borra
-- cada sucursal.
--
-- `branch_name` es el nombre corto con el que el dueño distingue sus
-- sucursales en el panel ("Centro", "Sur"). No es `studios.name`, que es el
-- que ve el alumno en el catalogo y suele ser el mismo en todas. Sin
-- capturar, el panel las numera: "Sucursal 1", "Sucursal 2".
--
-- Borrar una sucursal es `deleted_at`, no un DELETE: las reservas, los
-- paquetes vendidos y los ingresos cuelgan de ella y desaparecerian del
-- historial. Con la fecha puesta sale del catalogo y libera el lugar para
-- crear otra.

ALTER TABLE studios ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE studios ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS studios_owner_idx
  ON studios (owner_id) WHERE deleted_at IS NULL;

-- Cuantas sucursales permite cada plan. Basic 1, Pro 3.
ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_studios INTEGER NOT NULL DEFAULT 1;

-- Los valores de arranque van una sola vez, con el mismo candado que la 008:
-- run.js corre todos los .sql en cada despliegue y sin el, cada deploy
-- regresaria el limite que el admin haya cambiado despues.
CREATE TABLE IF NOT EXISTS data_migrations (
  name       TEXT        PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM data_migrations WHERE name = 'branch_limits') THEN
    RAISE NOTICE 'Limites de sucursales ya aplicados, no se toca nada.';
    RETURN;
  END IF;

  UPDATE plans SET max_studios = 3, updated_at = NOW() WHERE slug = 'pro';
  UPDATE plans SET max_studios = 1, updated_at = NOW() WHERE slug = 'light';

  INSERT INTO data_migrations (name) VALUES ('branch_limits');
END $$;
