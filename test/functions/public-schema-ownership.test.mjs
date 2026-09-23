import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const PUBLIC_AND_ADMIN_FUNCTIONS = [
  'site-settings.js',
  'legal-pages.js',
  'finance-page.js',
  'admin-site-settings.js',
  'admin-legal-pages.js',
  'admin-finance-page.js',
  'admin-coupons.js',
];

const RUNTIME_SCHEMA_DDL = /\b(?:CREATE\s+(?:TABLE|(?:UNIQUE\s+)?INDEX|(?:OR\s+REPLACE\s+)?(?:FUNCTION|TRIGGER|VIEW))|ALTER\s+TABLE|DROP\s+(?:CONSTRAINT|TABLE|INDEX|TRIGGER|FUNCTION|VIEW)|TRUNCATE\s+TABLE)\b/i;
const RUNTIME_SINGLETON_OR_SEED_INSERT = /\b(?:INSERT\s+INTO\s+(?:site_settings|finance_page_settings)\s*\(\s*id\s*\)\s*VALUES\s*\(\s*1\s*\)\s*ON\s+CONFLICT|INSERT\s+INTO\s+promo_coupons\s*\([^)]*\)\s*VALUES\s*\(\s*'[^']*')/is;

test('schema-ownership detectors catch schema mutations and seeds but allow parameterized CRUD', () => {
  assert.match('CREATE TRIGGER audit_trigger BEFORE UPDATE ON orders', RUNTIME_SCHEMA_DDL);
  assert.match('CREATE OR REPLACE FUNCTION set_updated_at()', RUNTIME_SCHEMA_DDL);
  assert.match('DROP INDEX IF EXISTS old_index', RUNTIME_SCHEMA_DDL);
  assert.match('TRUNCATE TABLE promo_coupons', RUNTIME_SCHEMA_DDL);
  assert.match('INSERT INTO site_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING', RUNTIME_SINGLETON_OR_SEED_INSERT);
  assert.match("INSERT INTO promo_coupons (code) VALUES ('NAVRIK25')", RUNTIME_SINGLETON_OR_SEED_INSERT);

  assert.doesNotMatch('INSERT INTO promo_coupons (code) VALUES (${code_clean})', RUNTIME_SINGLETON_OR_SEED_INSERT);
  assert.doesNotMatch('INSERT INTO legal_pages_settings (page, content) VALUES (${page}, ${content})', RUNTIME_SINGLETON_OR_SEED_INSERT);
});

test('deployed request handlers contain no runtime DDL or schema seed writes', async () => {
  for (const file of PUBLIC_AND_ADMIN_FUNCTIONS) {
    const source = await readFile(new URL(`../../netlify/functions/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, RUNTIME_SCHEMA_DDL);
    assert.doesNotMatch(source, RUNTIME_SINGLETON_OR_SEED_INSERT);
  }
});
