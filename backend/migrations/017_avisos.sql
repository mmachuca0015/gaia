-- Avisos de un estudio a sus alumnos.
--
-- El dueño los escribe en /owner/avisos y le llegan a quien tenga ESA
-- sucursal en favoritos, en su pestaña Notificaciones. No son correo: se
-- guardan aqui y el alumno los ve dentro de la app.
--
-- Son de la SUCURSAL, no de la cuenta: los favoritos tambien lo son, y un
-- aviso de Providencia no le sirve a quien va a Chapalita.
CREATE TABLE IF NOT EXISTS studio_notices (
  id         SERIAL      PRIMARY KEY,
  studio_id  INTEGER     NOT NULL REFERENCES studios (id) ON DELETE CASCADE,
  -- El limite de 500 vive aqui y en la ruta. En la base porque es lo que
  -- protege a la tabla de un cliente que no sea la app.
  body       TEXT        NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 500),
  -- A cuantos favoritos se les mando, contados AL MANDARLO. Se guarda en vez
  -- de contarse al leer porque los favoritos cambian: contarlos hoy diria a
  -- cuantos les llegaria ahora, no a cuantos les llego.
  recipients INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Las dos consultas que existen piden los ultimos 30 dias de una sucursal.
CREATE INDEX IF NOT EXISTS studio_notices_studio_idx
  ON studio_notices (studio_id, created_at DESC);

-- Hasta cuando el alumno ya vio sus avisos. Es una sola fecha y no una fila
-- por aviso leido: lo unico que se necesita es el punto rojo del menu, y con
-- una fila por aviso habria que escribir N renglones cada vez que abre la
-- pantalla. NULL = nunca ha entrado, asi que todo le sale como nuevo.
ALTER TABLE users ADD COLUMN IF NOT EXISTS notices_seen_at TIMESTAMPTZ;
