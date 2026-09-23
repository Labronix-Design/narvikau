-- 0011: Database-owned purchase modes for the public catalogue.
--
-- This is deliberately nullable: existing rows retain their current values and
-- the application resolves NULL from the authoritative integer-cent price.
-- Rollback after application rollback: drop the named constraints, then drop
-- these nullable columns. No catalogue row data is rewritten by this migration.

ALTER TABLE catalog_products
  ADD COLUMN IF NOT EXISTS purchase_mode TEXT;
ALTER TABLE catalog_accessories
  ADD COLUMN IF NOT EXISTS purchase_mode TEXT;

ALTER TABLE catalog_products
  DROP CONSTRAINT IF EXISTS catalog_products_purchase_mode_check;
ALTER TABLE catalog_products
  ADD CONSTRAINT catalog_products_purchase_mode_check
  CHECK (purchase_mode IN ('online_checkout', 'quote_only') OR purchase_mode IS NULL);

ALTER TABLE catalog_accessories
  DROP CONSTRAINT IF EXISTS catalog_accessories_purchase_mode_check;
ALTER TABLE catalog_accessories
  ADD CONSTRAINT catalog_accessories_purchase_mode_check
  CHECK (purchase_mode IN ('online_checkout', 'quote_only') OR purchase_mode IS NULL);
