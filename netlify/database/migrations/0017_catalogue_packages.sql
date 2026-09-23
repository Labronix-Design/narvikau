-- 0017: Dynamic catalogue packages. This is additive and does not alter or
-- delete existing catalogue records. Package price is stored in integer cents;
-- zero means the public package must be quoted rather than purchased online.
--
-- Rollback: remove package read-model rows, then drop catalog_package_items,
-- catalog_packages, their indexes and the replacement read-model constraint.

CREATE TABLE IF NOT EXISTS catalog_packages (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  gallery_urls TEXT[] NOT NULL DEFAULT '{}',
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS catalog_package_items (
  id SERIAL PRIMARY KEY,
  package_id INTEGER NOT NULL REFERENCES catalog_packages(id) ON DELETE RESTRICT,
  product_id INTEGER REFERENCES catalog_products(id) ON DELETE RESTRICT,
  accessory_id INTEGER REFERENCES catalog_accessories(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (product_id IS NOT NULL AND accessory_id IS NULL)
    OR (product_id IS NULL AND accessory_id IS NOT NULL)
  ),
  UNIQUE (package_id, product_id),
  UNIQUE (package_id, accessory_id)
);

CREATE INDEX IF NOT EXISTS idx_catalog_packages_active_sort
  ON catalog_packages (is_active, sort_order, name);
CREATE INDEX IF NOT EXISTS idx_catalog_package_items_package_sort
  ON catalog_package_items (package_id, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_catalog_package_items_product
  ON catalog_package_items (product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_catalog_package_items_accessory
  ON catalog_package_items (accessory_id) WHERE accessory_id IS NOT NULL;

-- `catalogue_read_models` was introduced with a named CHECK constraint by
-- Postgres. Replacing only that allow-list preserves every existing snapshot.
ALTER TABLE catalogue_read_models
  DROP CONSTRAINT IF EXISTS catalogue_read_models_section_check;
ALTER TABLE catalogue_read_models
  ADD CONSTRAINT catalogue_read_models_section_check
  CHECK (section IN ('products', 'accessories', 'packages', 'compatibility', 'categories'));
