import assert from 'node:assert/strict';
import test from 'node:test';
import { createSiteSettingsHandler } from '../../netlify/functions/site-settings.js';
import { createCatalogStorefrontHandler } from '../../netlify/functions/catalog-storefront.js';

const theme = {
  version: 1, surface: '#0a0908', surface_raised: '#171513', text: '#f2ede7', text_muted: '#c4bdb4',
  border: '#514c46', accent: '#ea580c', accent_text: '#0a0908', focus: '#c1bbb3', radius: 'subtle', density: 'standard',
};

test('public settings and storefront expose the same canonical theme and retain legacy values', async () => {
  const saved = { logo_url: '/logo.svg', primary_color: '#ABCDEF', background_color: '#ffffff', font_color: '#000000', theme: { ...theme, radius: 'rounded', density: 'compact' } };
  const queries = [];
  const direct = createSiteSettingsHandler({ getSql: () => async (strings) => { queries.push(strings.join(' ')); return [saved]; } });
  const catalogue = createCatalogStorefrontHandler({ getSql: () => async (strings) => { queries.push(strings.join(' ')); return [{ products: [], categories: [], settings: saved }]; } });
  const a = await direct({ httpMethod: 'GET' });
  const b = await catalogue({ httpMethod: 'GET' });
  assert.equal(a.statusCode, 200);
  assert.equal(b.statusCode, 200);
  assert.deepEqual(JSON.parse(a.body), saved);
  assert.deepEqual(JSON.parse(b.body).settings, saved);
  assert.match(queries[0], /\btheme\b/);
  assert.match(queries[1], /'theme',\s*theme/);
});

test('missing and malformed stored themes fall back safely without losing legacy colours', async () => {
  for (const storedTheme of [undefined, null, [], { version: 99 }, { ...theme, surface: 'bad' }]) {
    const legacy = { primary_color: '#ea580c', background_color: '#0a0908', font_color: '#f2ede7', theme: storedTheme };
    const response = await createSiteSettingsHandler({ getSql: () => async () => [legacy] })({ httpMethod: 'GET' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body).theme, theme);
  }
});

test('both public readers provide canonical theme defaults when the settings row is missing', async () => {
  const a = await createSiteSettingsHandler({ getSql: () => async () => [] })({ httpMethod: 'GET' });
  const b = await createCatalogStorefrontHandler({ getSql: () => async () => [] })({ httpMethod: 'GET' });
  assert.deepEqual(JSON.parse(a.body).theme, theme);
  assert.deepEqual(JSON.parse(b.body).settings.theme, theme);
});
