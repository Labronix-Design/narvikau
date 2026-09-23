import assert from 'node:assert/strict';
import test from 'node:test';

import { createCatalogStorefrontHandler } from '../../netlify/functions/catalog-storefront.js';

test('storefront read model returns only cached public catalogue and site configuration in one response', async () => {
  const queries = [];
  const sql = async (strings) => {
    queries.push(strings.join(' '));
    return [{
      products: [
        { id: 1, slug: 'navrik-canopy-adventure', name: 'Navrik Canopy — Adventure', category: 'canopy', gallery_urls: [] },
        { id: 2, slug: 'navrik-standard-tray', name: 'Standard Aluminium Tray', category: 'tray', gallery_urls: [] },
      ],
      settings: { logo_url: '/uploads/logo.svg', primary_color: '#ea580c' },
    }];
  };
  const handler = createCatalogStorefrontHandler({ getSql: () => sql });

  const response = await handler({ httpMethod: 'GET', queryStringParameters: null });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    products: [{ id: 1, slug: 'navrik-canopy-adventure', name: 'Navrik Canopy — Adventure', category: 'canopy', gallery_urls: [] }],
    settings: { logo_url: '/uploads/logo.svg', primary_color: '#ea580c' },
  });
  assert.doesNotMatch(response.body, /purchaseMode|price_cents|tray|accessor|compatibility|packages/i);
  assert.equal(queries.length, 1);
  assert.match(queries[0], /catalogue_read_models/);
  assert.doesNotMatch(queries[0], /accessor|compatibility|packages|categories/);
  assert.equal(response.headers['Netlify-Cache-Tag'], 'catalogue:storefront');
  assert.match(response.headers['Netlify-CDN-Cache-Control'], /durable/);
});

test('storefront read model rejects methods and query-driven cache bypasses', async () => {
  const handler = createCatalogStorefrontHandler({ getSql: () => async () => [] });

  const method = await handler({ httpMethod: 'POST', queryStringParameters: null });
  const query = await handler({ httpMethod: 'GET', queryStringParameters: { refresh: '1' } });

  assert.equal(method.statusCode, 405);
  assert.equal(query.statusCode, 400);
  assert.equal(method.headers['Cache-Control'], 'no-store');
  assert.equal(query.headers['Cache-Control'], 'no-store');
});
