-- Execute no Console do D1 saintscookies-creditos.
-- Repetir este SQL não apaga clientes, pontos, resgates ou estoque existente.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  request_key TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents BETWEEN 100 AND 1000000),
  customer_note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  sale_reference TEXT COLLATE NOCASE,
  points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (user_id, request_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS unique_confirmed_sale ON orders(sale_reference) WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rewards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  cost INTEGER NOT NULL CHECK (cost > 0),
  stock INTEGER NOT NULL CHECK (stock >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);
CREATE TABLE IF NOT EXISTS redemptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  reward_id TEXT NOT NULL REFERENCES rewards(id),
  request_key TEXT NOT NULL,
  points INTEGER NOT NULL CHECK (points > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fulfilled')),
  fulfilled_by TEXT REFERENCES users(id),
  fulfilled_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (user_id, request_key)
);
CREATE INDEX IF NOT EXISTS redemptions_user ON redemptions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS point_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  delta INTEGER NOT NULL CHECK (delta != 0),
  description TEXT NOT NULL,
  order_id TEXT UNIQUE REFERENCES orders(id),
  redemption_id TEXT UNIQUE REFERENCES redemptions(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK ((order_id IS NOT NULL AND redemption_id IS NULL AND delta > 0)
    OR (order_id IS NULL AND redemption_id IS NOT NULL AND delta < 0))
);
CREATE INDEX IF NOT EXISTS entries_user ON point_entries(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  window INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  PRIMARY KEY (key, window)
);

-- Demonstration rewards; this database is separate from the real storefront.
INSERT OR IGNORE INTO rewards (id, title, description, cost, stock) VALUES
  ('cookie-classico', 'Um clássico por nossa conta', '1 cookie clássico. Resgate ilustrativo para testar a fidelidade.', 50, 20),
  ('caixinha', 'Uma caixinha de carinho', 'Caixinha com 4 cookies. Disponibilidade confirmada pela equipe.', 150, 10),
  ('kit-especial', 'Um momento especial', 'Kit de cookies para compartilhar. Brinde de demonstração.', 300, 5);

-- Keep Wrangler migrations compatible with this initial console import.
CREATE TABLE IF NOT EXISTS d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0001_loyalty.sql');
