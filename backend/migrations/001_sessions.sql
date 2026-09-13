-- Sesiones de servidor. El token nunca se guarda en claro: se almacena su
-- hash SHA-256, de modo que una fuga de la base de datos no entrega sesiones
-- utilizables.
CREATE TABLE IF NOT EXISTS sessions (
  id          BIGSERIAL PRIMARY KEY,
  token_hash  TEXT        NOT NULL UNIQUE,
  user_id     INTEGER     NOT NULL,
  role        TEXT        NOT NULL CHECK (role IN ('user', 'owner', 'admin')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent  TEXT,
  ip          TEXT
);

CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS sessions_user_idx       ON sessions (user_id, role);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);
