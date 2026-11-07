CREATE TABLE IF NOT EXISTS d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0001_loyalty.sql');
CREATE TABLE IF NOT EXISTS checkout_fulfillment (
  checkout_id TEXT PRIMARY KEY REFERENCES checkout_orders(id),
  method TEXT NOT NULL CHECK (method IN ('pickup','delivery')),
  products_cents INTEGER NOT NULL CHECK (products_cents BETWEEN 100 AND 1000000),
  shipping_cents INTEGER NOT NULL CHECK (shipping_cents BETWEEN 0 AND 100000),
  region_id TEXT,
  region_name TEXT,
  delivery_address TEXT,
  address_confirmed_at INTEGER,
  CHECK ((method='pickup' AND shipping_cents=0 AND region_id IS NULL AND region_name IS NULL AND delivery_address IS NULL AND address_confirmed_at IS NULL)
    OR (method='delivery' AND region_id IS NOT NULL AND region_name IS NOT NULL AND delivery_address IS NOT NULL AND address_confirmed_at IS NOT NULL))
);

INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0004_checkout_fulfillment.sql');
