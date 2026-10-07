-- Generalise catalogue products while retaining the current canopy contract.
--
-- This migration is intentionally forward-only and idempotent: it leaves
-- existing product and lead rows intact, and it can be safely re-run after a
-- partial deployment. The legacy canopy columns remain available during this
-- release for backwards compatibility.

BEGIN;

-- 0001 created these two checks inline, so PostgreSQL assigned the following
-- names. Drop only those legacy product-list/category constraints.
ALTER TABLE catalog_products
  DROP CONSTRAINT IF EXISTS catalog_products_slug_check;

ALTER TABLE catalog_products
  DROP CONSTRAINT IF EXISTS catalog_products_category_check;

-- Generic products must not depend on the legacy canopy-only columns.
ALTER TABLE catalog_products
  ALTER COLUMN material DROP NOT NULL,
  ALTER COLUMN thickness DROP NOT NULL,
  ALTER COLUMN front_door_window DROP NOT NULL,
  ALTER COLUMN side_door DROP NOT NULL,
  ALTER COLUMN rear_door DROP NOT NULL,
  ALTER COLUMN vehicle_fit DROP NOT NULL;

ALTER TABLE catalog_products
  ADD COLUMN IF NOT EXISTS specifications JSONB;

ALTER TABLE catalog_products
  ALTER COLUMN specifications SET DEFAULT '{}'::jsonb;

-- Preserve existing non-empty generic data if this migration is re-run, while
-- lifting the current canopy details into a labelled generic object.
UPDATE catalog_products
SET specifications = jsonb_strip_nulls(jsonb_build_object(
  'Material', material,
  'Thickness', thickness,
  'Front door / window', front_door_window,
  'Side door', side_door,
  'Rear door', rear_door,
  'Vehicle fit', vehicle_fit
))
WHERE specifications IS NULL OR specifications = '{}'::jsonb;

ALTER TABLE catalog_products
  ALTER COLUMN specifications SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'catalog_products'::regclass
      AND conname = 'catalog_products_slug_format_check'
  ) THEN
    ALTER TABLE catalog_products
      ADD CONSTRAINT catalog_products_slug_format_check
      CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'catalog_products'::regclass
      AND conname = 'catalog_products_category_format_check'
  ) THEN
    ALTER TABLE catalog_products
      ADD CONSTRAINT catalog_products_category_format_check
      CHECK (category ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'catalog_products'::regclass
      AND conname = 'catalog_products_specifications_object_check'
  ) THEN
    ALTER TABLE catalog_products
      ADD CONSTRAINT catalog_products_specifications_object_check
      CHECK (jsonb_typeof(specifications) = 'object');
  END IF;
END;
$$;

-- Recreate the named source constraint without rewriting historical leads.
ALTER TABLE leads
  DROP CONSTRAINT IF EXISTS leads_source_check;

ALTER TABLE leads
  ADD CONSTRAINT leads_source_check
  CHECK (source IN ('contact_form', 'canopy_quote', 'product_quote'));

-- Publish a coherent products snapshot from all live active products. There
-- is deliberately no category or slug allowlist in this read-model rebuild.
INSERT INTO catalogue_read_models (section, payload, updated_at)
SELECT
  'products',
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'slug', slug,
        'name', name,
        'category', category,
        'size', size,
        'color', color,
        'description', description,
        'image_url', image_url,
        'sort_order', sort_order,
        'gallery_urls', gallery_urls,
        'material', material,
        'thickness', thickness,
        'front_door_window', front_door_window,
        'side_door', side_door,
        'rear_door', rear_door,
        'vehicle_fit', vehicle_fit,
        'specifications', specifications
      )
      ORDER BY sort_order ASC, name ASC
    ),
    '[]'::jsonb
  ),
  NOW()
FROM catalog_products
WHERE is_active = TRUE
ON CONFLICT (section) DO UPDATE SET
  payload = EXCLUDED.payload,
  updated_at = EXCLUDED.updated_at;

COMMIT;
