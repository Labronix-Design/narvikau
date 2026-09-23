import assert from 'node:assert/strict';
import test from 'node:test';

import { createCatalogStorefrontHandler } from '../../netlify/functions/catalog-storefront.js';

test('storefront read model returns only cached public catalogue and site configuration in one response', async () => {
  const queries = [];
  const sql = async (strings) => {
    queries.push(strings.join(' '));
    return [{
      products: [{ id: 1, slug: 'canopy', base_price_cents: 120000, purchaseMode: 'online_checkout' }],
      accessories: [{ id: 2, slug: 'toolbox', price_cents: 40000, purchaseMode: 'online_checkout' }],
      compatibility: [{ id: 3, accessory_id: 2 }],
      categories: [{ id: 4, slug: 'canopy', name: 'Canopies' }],
      settings: { logo_url: '/uploads/logo.svg', primary_color: '#ea580c' },
    }];
  };
  const handler = createCatalogStorefrontHandler({ getSql: () => sql });

  const response = await handler({ httpMethod: 'GET', queryStringParameters: null });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    products: [{ id: 1, slug: 'canopy', base_price_cents: 120000, purchaseMode: 'online_checkout' }],
    accessories: [{ id: 2, slug: 'toolbox', price_cents: 40000, purchaseMode: 'online_checkout' }],
    compatibility: [{ id: 3, accessory_id: 2 }],
    categories: [{ id: 4, slug: 'canopy', name: 'Canopies' }],
    settings: { logo_url: '/uploads/logo.svg', primary_color: '#ea580c' },
  });
  assert.equal(queries.length, 1);
  assert.match(queries[0], /catalogue_read_models/);
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
