CREATE TABLE IF NOT EXISTS account_roles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('admin','owner','customer')),
  changed_by TEXT REFERENCES users(id),
  change_id TEXT UNIQUE,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS role_changes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  previous_role TEXT NOT NULL CHECK (previous_role IN ('admin','owner','customer')),
  new_role TEXT NOT NULL CHECK (new_role IN ('admin','owner','customer')),
  changed_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS role_changes_user ON role_changes(user_id,created_at DESC);
