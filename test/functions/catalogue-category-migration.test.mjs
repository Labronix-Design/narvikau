import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../../netlify/database/migrations/0003_navrik-standard-catalogue-and-leads.sql', import.meta.url), 'utf8');

// SQL contract checks only: these cannot establish PostgreSQL execution semantics.
test('migration remaps every long historical category before backfill and foreign key creation', () => {
  const update = migration.indexOf('UPDATE catalog_products\n    SET category = canonical_slug');
  assert.ok(update > 0, 'historical product categories must be remapped');
  assert.ok(update < migration.indexOf('INSERT INTO catalog_categories'));
  assert.ok(update < migration.indexOf('FOREIGN KEY (category)'));
  assert.match(migration, /WHERE length\(category\) > 120[\s\S]*?ORDER BY category COLLATE "C"/);
  assert.match(migration, /UPDATE catalog_products\s+SET category = canonical_slug\s+WHERE category = original_slug;/);
  assert.match(migration, /SELECT DISTINCT\s+p\.category,[\s\S]*?FROM catalog_products AS p\s+WHERE p\.category <> 'canopy'/);
  assert.doesNotMatch(migration.slice(0, update), /DELETE FROM catalog_products|WHERE is_active/);
});

test('migration uses a bounded SHA-256 suffix and retries collisions against existing category associations', () => {
  assert.match(migration, /LOCK TABLE catalog_products IN SHARE ROW EXCLUSIVE MODE/);
  assert.match(migration, /rtrim\(left\(original_slug, 55\), '-'\)/);
  assert.match(migration, /encode\(sha256\(convert_to\(original_slug \|\| ':' \|\| attempt::text, 'UTF8'\)\), 'hex'\)/);
  assert.match(migration, /EXIT WHEN NOT EXISTS \([\s\S]*?FROM catalog_products WHERE category = canonical_slug[\s\S]*?FROM catalog_categories WHERE slug = canonical_slug[\s\S]*?\);\s+attempt := attempt \+ 1;/);
  assert.match(migration, /attempt := 0;[\s\S]*?LOOP[\s\S]*?canonical_slug :=/);
});

test('migration bounds future category writes while rebuilding both canonical public snapshots', () => {
  assert.match(migration, /CHECK \(length\(slug\) BETWEEN 1 AND 120 AND slug ~/);
  assert.match(migration, /ADD CONSTRAINT catalog_products_category_length_check\s+CHECK \(length\(category\) BETWEEN 1 AND 120\)/);
  assert.ok(migration.indexOf('SET category = canonical_slug') < migration.indexOf('ADD CONSTRAINT catalog_products_category_length_check'));
  assert.match(migration, /SELECT 'categories',[\s\S]*?'slug', slug/);
  assert.match(migration, /SELECT 'products',[\s\S]*?'category', p\.category/);
});
