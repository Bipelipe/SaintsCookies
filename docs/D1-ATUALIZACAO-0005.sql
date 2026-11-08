CREATE TABLE IF NOT EXISTS d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0001_loyalty.sql');
CREATE TABLE IF NOT EXISTS customer_regions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  region_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0005_customer_regions.sql');
