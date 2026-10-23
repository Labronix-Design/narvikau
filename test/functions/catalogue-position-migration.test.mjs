import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('position migration holds write-blocking locks from before normalization until triggers are installed', () => {
  // Contract check only: a real PostgreSQL run is required to verify lock semantics.
  const sql = readFileSync(new URL('../../netlify/database/migrations/0006_catalogue_positions.sql', import.meta.url), 'utf8');
  const begin = sql.indexOf('BEGIN;');
  const lock = sql.indexOf('LOCK TABLE catalog_categories, catalog_products, product_variants IN SHARE ROW EXCLUSIVE MODE;');
  const ranking = sql.indexOf('WITH ranked AS');
  const trigger = sql.lastIndexOf('CREATE TRIGGER');
  const commit = sql.lastIndexOf('COMMIT;');
  assert.ok(begin >= 0 && begin < lock && lock < ranking && ranking < trigger && trigger < commit);
});
