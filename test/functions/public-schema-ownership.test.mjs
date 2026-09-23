import assert from 'node:assert/strict';
import test from 'node:test';

import { createAdminSiteSettingsHandler } from '../../netlify/functions/admin-site-settings.js';
import { createSiteSettingsHandler } from '../../netlify/functions/site-settings.js';

const freshSettings = {
  logo_url: null,
  font_family: 'Inter',
  primary_color: '#ea580c',
  hero_slides: [],
  brand_logos: [],
  contact: {},
  trust_bar: [],
};

test('public site settings reads and returns the fresh AU settings columns', async () => {
  const queries = [];
  const sql = async (strings) => {
    const query = strings.join(' ');
    queries.push(query);
    if (/compat_note/i.test(query)) {
      const error = new Error('column "compat_note" does not exist');
      error.code = '42703';
      throw error;
    }
    return [freshSettings];
  };
  const handler = createSiteSettingsHandler({ getSql: () => sql });

  const response = await handler({ httpMethod: 'GET' });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), freshSettings);
  assert.equal(queries.length, 1);
  assert.match(queries[0], /^SELECT logo_url/);
  assert.doesNotMatch(queries[0], /compat_note/i);
});

test('admin site settings updates the migration-owned AU row without runtime schema writes', async () => {
  const queries = [];
  const sql = async (strings) => {
    const query = strings.join(' ');
    queries.push(query);
    if (/\b(?:CREATE|ALTER|DROP|TRUNCATE|INSERT)\b/i.test(query)) {
      throw new Error('runtime schema or seed write is not allowed');
    }
    return [freshSettings];
  };
  const handler = createAdminSiteSettingsHandler({
    verifyToken: async () => true,
    getSql: () => sql,
    purgeTags: async () => {},
  });

  const response = await handler({
    httpMethod: 'PUT',
    headers: {},
    body: JSON.stringify({ font_family: 'Inter', primary_color: '#ea580c' }),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), freshSettings);
  assert.equal(queries.length, 1);
  assert.match(queries[0], /^\s*UPDATE site_settings SET/);
  assert.doesNotMatch(queries[0], /compat_note/i);
});
