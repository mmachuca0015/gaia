-- Hora de fin de cada horario, y el arreglo de la clase unica.
--
-- 1. `day` deja de ser obligatorio. Una clase unica no cae en un dia de la
--    semana, cae en una fecha (schedules.date), y asi la busca services/spots.js.
--    Con el NOT NULL el INSERT de una clase unica reventaba y la peticion
--    respondia un 500: crear una clase unica nunca funciono.
--
-- 2. `end_time`. Antes se suponia que todas las clases duraban una hora, y el
--    calendario del dueño dibujaba una hora exacta. Ahora el dueño elige a que
--    hora empieza y a que hora termina. Lo que ya estaba se rellena con una
--    hora, que es lo que duraba.
--
-- No hay clases que crucen la medianoche, igual que en studio_hours.

ALTER TABLE schedules ALTER COLUMN day DROP NOT NULL;

ALTER TABLE schedules ADD COLUMN IF NOT EXISTS end_time TIME;

UPDATE schedules
   SET end_time = CASE
         WHEN time > TIME '22:59' THEN TIME '23:59'
         ELSE time + INTERVAL '1 hour'
       END
 WHERE end_time IS NULL;

ALTER TABLE schedules ALTER COLUMN end_time SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schedules_end_after_start'
  ) THEN
    ALTER TABLE schedules
      ADD CONSTRAINT schedules_end_after_start CHECK (end_time > time);
  END IF;
END $$;
