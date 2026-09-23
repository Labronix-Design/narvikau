-- 0018: Remove the discontinued calculated-combo feature. This migration only
-- removes combo tables and their derived read-model snapshot; it never deletes
-- catalogue products, accessories, orders, customers, or warranty records.

DELETE FROM catalogue_read_models WHERE section = 'packages';

DROP TABLE IF EXISTS catalog_package_items;
DROP TABLE IF EXISTS catalog_packages;

ALTER TABLE catalogue_read_models
  DROP CONSTRAINT IF EXISTS catalogue_read_models_section_check;
ALTER TABLE catalogue_read_models
  ADD CONSTRAINT catalogue_read_models_section_check
  CHECK (section IN ('products', 'accessories', 'compatibility', 'categories'));

-- A normal product category. Products under this category remain admin-managed
-- catalogue records and are quote-only unless an administrator sets a valid
-- online purchase mode and price.
INSERT INTO catalog_categories (slug, name, type, eyebrow, icon, description, sort_order, is_active)
VALUES (
  'custom-made-tray-and-canopy-combo',
  'Custom Made Tray and Canopy Combo',
  'product',
  'Built for your bakkie',
  'build',
  'Navrik’s Custom Bakkie Tray and Canopy Combo and Accessories range is designed for South Africa’s demanding conditions. From tradesmen and farmers to 4x4 enthusiasts and everyday bakkie owners, our high-quality aluminium trays, modular canopies, toolboxes and camping accessories deliver practical, dependable value. Every product is manufactured to strict quality standards using durable 5052-grade aluminium for excellent strength and corrosion resistance, and is backed by a 24-month structural warranty. Whether you need secure job-site storage, a dependable farm setup or extra capability for your next off-road adventure, Navrik has the accessories to make your bakkie work harder and take you further.',
  30,
  TRUE
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  eyebrow = EXCLUDED.eyebrow,
  icon = EXCLUDED.icon,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_active = TRUE;
