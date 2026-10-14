-- Managed catalogue categories and richer enquiry attribution.
-- Reverse order: remove the category FK, restore the legacy cache section
-- check after deleting its categories row, drop the new lead columns and
-- category table. Preserve canopy_quote in the source check while old rows
-- exist; a rollback must not discard historical leads.

BEGIN;

CREATE TABLE IF NOT EXISTS catalog_categories (
  id           SERIAL PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  description  TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT catalog_categories_slug_format_check
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT catalog_categories_name_check
    CHECK (length(btrim(name)) BETWEEN 1 AND 160 AND name = btrim(name)),
  CONSTRAINT catalog_categories_description_check
    CHECK (description IS NULL OR length(description) <= 2000),
  CONSTRAINT catalog_categories_sort_order_check
    CHECK (sort_order BETWEEN -100000 AND 100000)
);

CREATE INDEX IF NOT EXISTS idx_catalog_categories_active_sort
  ON catalog_categories (is_active, sort_order, name);

DROP TRIGGER IF EXISTS trg_catalog_categories_updated_at ON catalog_categories;
CREATE TRIGGER trg_catalog_categories_updated_at
  BEFORE UPDATE ON catalog_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO catalog_categories (slug, name, sort_order, is_active)
VALUES ('canopy', 'Canopies', 0, TRUE)
ON CONFLICT (slug) DO NOTHING;

-- 0002 permitted any URL-safe product category slug. Give every historical
-- category a managed row before enforcing the FK, including categories whose
-- products are currently inactive. A fresh AU database still has only Canopies.
INSERT INTO catalog_categories (slug, name, sort_order, is_active)
SELECT DISTINCT
  p.category,
  btrim(left(initcap(replace(p.category, '-', ' ')), 160)),
  0,
  TRUE
FROM catalog_products AS p
WHERE p.category <> 'canopy'
ON CONFLICT (slug) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'catalog_products'::regclass
      AND conname = 'catalog_products_category_fkey'
  ) THEN
    ALTER TABLE catalog_products
      ADD CONSTRAINT catalog_products_category_fkey
      FOREIGN KEY (category) REFERENCES catalog_categories(slug)
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_catalog_products_active_category_sort
  ON catalog_products (category, sort_order, name)
  WHERE is_active = TRUE;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS enquiry_type TEXT,
  ADD COLUMN IF NOT EXISTS location_state TEXT,
  ADD COLUMN IF NOT EXISTS location_suburb TEXT,
  ADD COLUMN IF NOT EXISTS discovery_source TEXT,
  ADD COLUMN IF NOT EXISTS discovery_source_detail TEXT;

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE leads ADD CONSTRAINT leads_source_check
  CHECK (source IN ('contact_form', 'canopy_quote', 'product_quote', 'partner_form', 'manual'));

ALTER TABLE catalogue_read_models
  DROP CONSTRAINT IF EXISTS catalogue_read_models_section_check;
ALTER TABLE catalogue_read_models
  ADD CONSTRAINT catalogue_read_models_section_check
  CHECK (section IN ('products', 'categories'));

INSERT INTO catalogue_read_models (section, payload, updated_at)
SELECT 'categories', COALESCE(jsonb_agg(jsonb_build_object(
  'id', id,
  'slug', slug,
  'name', name,
  'description', description,
  'sort_order', sort_order
) ORDER BY sort_order ASC, name ASC), '[]'::jsonb), NOW()
FROM catalog_categories
WHERE is_active = TRUE
ON CONFLICT (section) DO UPDATE SET
  payload = EXCLUDED.payload,
  updated_at = EXCLUDED.updated_at;

INSERT INTO catalogue_read_models (section, payload, updated_at)
SELECT 'products', COALESCE(jsonb_agg(jsonb_build_object(
  'id', p.id,
  'slug', p.slug,
  'name', p.name,
  'category', p.category,
  'size', p.size,
  'color', p.color,
  'description', p.description,
  'image_url', p.image_url,
  'sort_order', p.sort_order,
  'gallery_urls', p.gallery_urls,
  'material', p.material,
  'thickness', p.thickness,
  'front_door_window', p.front_door_window,
  'side_door', p.side_door,
  'rear_door', p.rear_door,
  'vehicle_fit', p.vehicle_fit,
  'specifications', p.specifications
) ORDER BY p.sort_order ASC, p.name ASC), '[]'::jsonb), NOW()
FROM catalog_products AS p
JOIN catalog_categories AS c ON c.slug = p.category AND c.is_active = TRUE
WHERE p.is_active = TRUE
ON CONFLICT (section) DO UPDATE SET
  payload = EXCLUDED.payload,
  updated_at = EXCLUDED.updated_at;

COMMIT;
