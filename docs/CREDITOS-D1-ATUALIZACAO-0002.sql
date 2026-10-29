CREATE TABLE IF NOT EXISTS d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0001_loyalty.sql');
CREATE TABLE IF NOT EXISTS customer_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  payment_preference TEXT NOT NULL CHECK (payment_preference IN ('pix','credit_card','debit_card','cash')),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS checkout_orders (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  request_key TEXT NOT NULL,
  cart_key TEXT NOT NULL,
  loyalty_order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  payment_preference TEXT NOT NULL,
  fulfillment TEXT NOT NULL DEFAULT 'pickup' CHECK (fulfillment = 'pickup'),
  amount_cents INTEGER NOT NULL CHECK (amount_cents BETWEEN 100 AND 1000000),
  status TEXT NOT NULL DEFAULT 'accepted' CHECK (status = 'accepted'),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','confirmed','not_approved')),
  whatsapp_consent INTEGER NOT NULL CHECK (whatsapp_consent IN (0,1)),
  consent_text TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (user_id, request_key)
);
CREATE INDEX IF NOT EXISTS checkout_user ON checkout_orders(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS checkout_items (
  checkout_id TEXT NOT NULL REFERENCES checkout_orders(id),
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  unit_cents INTEGER NOT NULL CHECK (unit_cents > 0),
  PRIMARY KEY (checkout_id, product_id)
);

CREATE TABLE IF NOT EXISTS whatsapp_outbox (
  checkout_id TEXT PRIMARY KEY REFERENCES checkout_orders(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','not_configured','opted_out','sending','submitted','delivered','read','failed','uncertain')),
  attempts INTEGER NOT NULL DEFAULT 0,
  message_id TEXT UNIQUE,
  error_code TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0002_checkout_whatsapp.sql');
