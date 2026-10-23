-- Lock in parent-to-child order and retain locks through snapshot and trigger setup.
-- Reads continue, while concurrent catalogue mutations wait until Netlify's
-- migration transaction commits.
-- Netlify normally invalidates these responses on atomic deployment (the
-- catalogue responses do not opt out using Netlify-Cache-ID). Verify the
-- live payload and Cache-Status after deployment; purge catalogue:products,
-- catalogue:categories and catalogue:storefront if stale content persists.
LOCK TABLE catalog_categories, catalog_products, product_variants IN SHARE ROW EXCLUSIVE MODE;

-- Record the creation intent so a retry can distinguish a clamped insertion
-- from a conflicting request for a different position. Existing rows have no
-- creation intent and retain the prior exact-match fallback.
ALTER TABLE catalog_categories ADD COLUMN creation_requested_position integer;
ALTER TABLE catalog_categories ADD COLUMN creation_saved_position integer;

-- Existing positions are not necessarily positive or unique. Keep their prior
-- ordering, including inactive rows, with id as a deterministic tie-breaker.
WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY sort_order, name, id)::integer AS position
  FROM catalog_categories
)
UPDATE catalog_categories AS c SET sort_order = ranked.position FROM ranked WHERE c.id = ranked.id;

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY category ORDER BY sort_order, name, id)::integer AS position
  FROM catalog_products
)
UPDATE catalog_products AS p SET sort_order = ranked.position FROM ranked WHERE p.id = ranked.id;

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY product_id, variant_type ORDER BY sort_order, id)::integer AS position
  FROM product_variants
)
UPDATE product_variants AS v SET sort_order = ranked.position FROM ranked WHERE v.id = ranked.id;

INSERT INTO catalogue_read_models (section, payload, updated_at)
SELECT 'categories', COALESCE(jsonb_agg(jsonb_build_object(
  'id', id, 'slug', slug, 'name', name, 'description', description, 'sort_order', sort_order
) ORDER BY sort_order, name), '[]'::jsonb), NOW()
FROM catalog_categories WHERE is_active = TRUE
ON CONFLICT (section) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at;

INSERT INTO catalogue_read_models (section, payload, updated_at)
SELECT 'products', COALESCE(jsonb_agg(jsonb_build_object(
  'id', p.id, 'slug', p.slug, 'name', p.name, 'category', p.category,
  'size', p.size, 'color', p.color, 'description', p.description, 'image_url', p.image_url,
  'sort_order', p.sort_order, 'gallery_urls', p.gallery_urls, 'material', p.material,
  'thickness', p.thickness, 'front_door_window', p.front_door_window, 'side_door', p.side_door,
  'rear_door', p.rear_door, 'vehicle_fit', p.vehicle_fit, 'specifications', p.specifications
) ORDER BY p.sort_order, p.name), '[]'::jsonb), NOW()
FROM catalog_products p JOIN catalog_categories c ON c.slug = p.category AND c.is_active = TRUE
WHERE p.is_active = TRUE
ON CONFLICT (section) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at;

ALTER TABLE catalog_categories ALTER COLUMN sort_order SET DEFAULT 100000;
ALTER TABLE catalog_products ALTER COLUMN sort_order SET DEFAULT 100000;
ALTER TABLE product_variants ALTER COLUMN sort_order SET DEFAULT 100000;

-- All catalogue ordering writes use a common transaction lock. Recursive
-- neighbour updates bypass this trigger; the original operation owns the lock.
CREATE FUNCTION maintain_catalogue_positions() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  scope_count integer;
  target integer;
  old_id integer;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(1350564182, 1);
  IF TG_OP <> 'INSERT' THEN old_id := OLD.id; END IF;
  IF TG_TABLE_NAME = 'catalog_categories' THEN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      UPDATE catalog_categories SET sort_order = sort_order - 1 WHERE id <> OLD.id AND sort_order > OLD.sort_order;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    SELECT count(*) INTO scope_count FROM catalog_categories WHERE old_id IS NULL OR id <> old_id;
    target := greatest(1, least(NEW.sort_order, scope_count + 1));
    IF TG_OP = 'INSERT' THEN
      NEW.creation_requested_position := NEW.sort_order;
      NEW.creation_saved_position := target;
    END IF;
    UPDATE catalog_categories SET sort_order = sort_order + 1 WHERE (old_id IS NULL OR id <> old_id) AND sort_order >= target;
  ELSIF TG_TABLE_NAME = 'catalog_products' THEN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      UPDATE catalog_products SET sort_order = sort_order - 1 WHERE id <> OLD.id AND category = OLD.category AND sort_order > OLD.sort_order;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    SELECT count(*) INTO scope_count FROM catalog_products WHERE category = NEW.category AND (old_id IS NULL OR id <> old_id);
    target := greatest(1, least(NEW.sort_order, scope_count + 1));
    UPDATE catalog_products SET sort_order = sort_order + 1 WHERE category = NEW.category AND (old_id IS NULL OR id <> old_id) AND sort_order >= target;
  ELSE
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      UPDATE product_variants SET sort_order = sort_order - 1 WHERE id <> OLD.id AND product_id = OLD.product_id AND variant_type = OLD.variant_type AND sort_order > OLD.sort_order;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    SELECT count(*) INTO scope_count FROM product_variants WHERE product_id = NEW.product_id AND variant_type = NEW.variant_type AND (old_id IS NULL OR id <> old_id);
    target := greatest(1, least(NEW.sort_order, scope_count + 1));
    UPDATE product_variants SET sort_order = sort_order + 1 WHERE product_id = NEW.product_id AND variant_type = NEW.variant_type AND (old_id IS NULL OR id <> old_id) AND sort_order >= target;
  END IF;
  NEW.sort_order := target;
  RETURN NEW;
END;
$$;

CREATE TRIGGER category_positions BEFORE INSERT OR UPDATE OR DELETE ON catalog_categories FOR EACH ROW EXECUTE FUNCTION maintain_catalogue_positions();
CREATE TRIGGER product_positions BEFORE INSERT OR UPDATE OR DELETE ON catalog_products FOR EACH ROW EXECUTE FUNCTION maintain_catalogue_positions();
CREATE TRIGGER variant_positions BEFORE INSERT OR UPDATE OR DELETE ON product_variants FOR EACH ROW EXECUTE FUNCTION maintain_catalogue_positions();
