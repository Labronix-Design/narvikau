-- 0009: Admin-owned catalogue data, integer-cent money, and server read models.
-- This migration is intentionally additive while legacy public clients are migrated.

CREATE TABLE IF NOT EXISTS catalog_categories (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'product',
  eyebrow TEXT,
  icon TEXT,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS catalog_products (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'product',
  tray_type TEXT,
  size TEXT,
  color TEXT NOT NULL DEFAULT 'silver',
  description TEXT,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  gallery_urls TEXT[] NOT NULL DEFAULT '{}',
  material TEXT,
  thickness TEXT,
  front_door_window TEXT,
  side_door TEXT,
  rear_door TEXT,
  vehicle_fit TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_variants (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
  variant_type TEXT NOT NULL,
  variant_value TEXT NOT NULL,
  label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS catalog_accessories (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compatibility_matrix (
  id SERIAL PRIMARY KEY,
  accessory_id INTEGER NOT NULL REFERENCES catalog_accessories(id) ON DELETE CASCADE,
  tray_type TEXT,
  product_id INTEGER REFERENCES catalog_products(id) ON DELETE SET NULL,
  vehicle_make TEXT,
  vehicle_model TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS base_price_cents INTEGER;
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS coating_cost_cents INTEGER;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS price_delta_cents INTEGER;
ALTER TABLE catalog_accessories ADD COLUMN IF NOT EXISTS price_cents INTEGER;

-- Order price columns are authoritative integer cents. Legacy decimal columns
-- remain only for historical display during the staged client migration.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS base_price_cents INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS configuration_cost_cents INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount_cents INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS installation_cost_cents INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_excl_vat_cents INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_amount_cents INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_incl_vat_cents INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS balance_due_cents INTEGER;
ALTER TABLE promo_slots ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS coupon_usage_reservations (
  id BIGSERIAL PRIMARY KEY,
  coupon_id INTEGER NOT NULL REFERENCES promo_coupons(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('reserved', 'committed', 'released')) DEFAULT 'reserved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  committed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_reservations_reserved ON coupon_usage_reservations (coupon_id) WHERE state = 'reserved';

-- These catalogue tables are introduced by this migration, so no legacy
-- decimal catalogue columns exist to backfill. Default existing rows from a
-- partially-created development table to a safe zero amount instead.
UPDATE catalog_products SET base_price_cents = COALESCE(base_price_cents, 0), coating_cost_cents = COALESCE(coating_cost_cents, 0) WHERE base_price_cents IS NULL OR coating_cost_cents IS NULL;
UPDATE product_variants SET price_delta_cents = COALESCE(price_delta_cents, 0) WHERE price_delta_cents IS NULL;
UPDATE catalog_accessories SET price_cents = COALESCE(price_cents, 0) WHERE price_cents IS NULL;
UPDATE orders SET
  base_price_cents = ROUND(COALESCE(base_price, 0) * 100)::INTEGER,
  configuration_cost_cents = ROUND(COALESCE(coating_cost, 0) * 100)::INTEGER,
  discount_amount_cents = ROUND(COALESCE(discount_amount, 0) * 100)::INTEGER,
  installation_cost_cents = ROUND(COALESCE(installation_cost, 0) * 100)::INTEGER,
  amount_excl_vat_cents = ROUND(COALESCE(amount_excl_vat, 0) * 100)::INTEGER,
  vat_amount_cents = ROUND(COALESCE(vat_amount, 0) * 100)::INTEGER,
  total_incl_vat_cents = ROUND(COALESCE(total_incl_vat, 0) * 100)::INTEGER,
  balance_due_cents = ROUND(COALESCE(balance_due, 0) * 100)::INTEGER
WHERE base_price_cents IS NULL;

ALTER TABLE catalog_products ALTER COLUMN base_price_cents SET DEFAULT 0;
ALTER TABLE catalog_products ALTER COLUMN base_price_cents SET NOT NULL;
ALTER TABLE catalog_products ALTER COLUMN coating_cost_cents SET DEFAULT 0;
ALTER TABLE catalog_products ALTER COLUMN coating_cost_cents SET NOT NULL;
ALTER TABLE product_variants ALTER COLUMN price_delta_cents SET DEFAULT 0;
ALTER TABLE product_variants ALTER COLUMN price_delta_cents SET NOT NULL;
ALTER TABLE catalog_accessories ALTER COLUMN price_cents SET DEFAULT 0;
ALTER TABLE catalog_accessories ALTER COLUMN price_cents SET NOT NULL;

ALTER TABLE catalog_products DROP CONSTRAINT IF EXISTS catalog_products_base_price_cents_check;
ALTER TABLE catalog_products ADD CONSTRAINT catalog_products_base_price_cents_check CHECK (base_price_cents >= 0);
ALTER TABLE catalog_products DROP CONSTRAINT IF EXISTS catalog_products_coating_cost_cents_check;
ALTER TABLE catalog_products ADD CONSTRAINT catalog_products_coating_cost_cents_check CHECK (coating_cost_cents >= 0);
ALTER TABLE catalog_accessories DROP CONSTRAINT IF EXISTS catalog_accessories_price_cents_check;
ALTER TABLE catalog_accessories ADD CONSTRAINT catalog_accessories_price_cents_check CHECK (price_cents >= 0);

CREATE TABLE IF NOT EXISTS catalogue_read_models (
  section TEXT PRIMARY KEY CHECK (section IN ('products', 'accessories', 'compatibility', 'categories')),
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_products_active_sort ON catalog_products (is_active, sort_order, category, name);
CREATE INDEX IF NOT EXISTS idx_product_variants_active_product ON product_variants (product_id, is_active, variant_type, sort_order);
CREATE INDEX IF NOT EXISTS idx_catalog_accessories_active_sort ON catalog_accessories (is_active, sort_order, category, name);

-- Exact known catalogue record only; no broad text deletion.
DELETE FROM catalog_products WHERE slug = 'navrik-canopy-expedition';
