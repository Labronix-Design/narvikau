import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('position migration leaves its transaction lifecycle to Netlify', () => {
  // Netlify's migration runner wraps each file in its own transaction. An
  // explicit COMMIT leaves that runner with an idle transaction to commit.
  const sql = readFileSync(new URL('../../netlify/database/migrations/0006_catalogue_positions.sql', import.meta.url), 'utf8');
  const lock = sql.indexOf('LOCK TABLE catalog_categories, catalog_products, product_variants IN SHARE ROW EXCLUSIVE MODE;');
  const ranking = sql.indexOf('WITH ranked AS');
  const trigger = sql.lastIndexOf('CREATE TRIGGER');
  assert.ok(lock >= 0 && lock < ranking && ranking < trigger);
  assert.doesNotMatch(sql, /^\s*(?:BEGIN|COMMIT);\s*$/im);
});
