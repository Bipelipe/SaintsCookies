// Additive extension: the old pickup-only column stays intact for legacy data.
// This fixed, idempotent DDL also upgrades an existing Preview DB on first use.
// No historical rows, credentials or migration history are changed.
export const shippingSchema = `CREATE TABLE IF NOT EXISTS checkout_fulfillment (
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
)`;
export async function ensureShippingSchema(db) {
  const exists=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='checkout_fulfillment'").first();
  if (!exists) await db.prepare(shippingSchema).run();
}
