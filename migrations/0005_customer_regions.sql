CREATE TABLE IF NOT EXISTS customer_regions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  region_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
