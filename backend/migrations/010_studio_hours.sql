-- Horario de atencion de cada estudio: un rango por dia de la semana.
--
-- `day` usa la misma convencion que schedules.day: 0 = domingo. Un dia sin
-- fila es un dia cerrado. No hay horarios que crucen la medianoche: un
-- estudio que cierra a las 00:00 guarda 23:59.
--
-- Con horario, "Abierto/Cerrado" se calcula con la hora de Mexico
-- (STUDIO_OPEN_NOW en services/catalog.js). Los estudios registrados antes
-- no tienen filas y siguen usando la columna studios.is_open hasta que el
-- dueño capture su horario.
CREATE TABLE IF NOT EXISTS studio_hours (
  studio_id INTEGER  NOT NULL REFERENCES studios (id) ON DELETE CASCADE,
  day       SMALLINT NOT NULL CHECK (day BETWEEN 0 AND 6),
  opens     TIME     NOT NULL,
  closes    TIME     NOT NULL,
  PRIMARY KEY (studio_id, day),
  CHECK (closes > opens)
);
