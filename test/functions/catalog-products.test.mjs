import assert from 'node:assert/strict';
import test from 'node:test';

import * as catalogProducts from '../../netlify/functions/catalog-products.js';

test('catalog products returns the cached product read model on GET', async () => {
  const cachedProducts = [{
    id: 7,
    slug: 'navrik-canopy-adventure',
    name: 'Navrik Canopy — Adventure',
    category: 'canopy',
    gallery_urls: [],
    base_price_cents: 125000,
    purchase_mode: 'online_checkout',
  }, {
    id: 8,
    slug: 'navrik-standard-tray',
    name: 'Standard Aluminium Tray',
    category: 'tray',
    gallery_urls: [],
  }];
  const sql = async (strings) => {
    assert.match(strings.join(' '), /FROM catalogue_read_models/);
    return [{ payload: cachedProducts }];
  };
  const handler = catalogProducts.createCatalogProductsHandler({ getSql: () => sql });

  const response = await handler({ httpMethod: 'GET' });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), [{
    id: 7,
    slug: 'navrik-canopy-adventure',
    name: 'Navrik Canopy — Adventure',
    category: 'canopy',
    gallery_urls: [],
  }]);
  assert.doesNotMatch(response.body, /purchaseMode|price_cents|tray|accessory/i);
  assert.match(response.headers['Netlify-CDN-Cache-Control'], /durable/);
  assert.equal(response.headers['Netlify-Cache-Tag'], 'catalogue:products');
});

test('catalog products OPTIONS response is successful and never cached', async () => {
  const response = await catalogProducts.handler({ httpMethod: 'OPTIONS' });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, '');
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(response.headers['Netlify-CDN-Cache-Control'], 'no-store');
});

test('catalog products rejects non-GET requests without caching the response', async () => {
  const response = await catalogProducts.handler({ httpMethod: 'POST' });

  assert.equal(response.statusCode, 405);
  assert.deepEqual(JSON.parse(response.body), { error: 'Method not allowed' });
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(response.headers['Netlify-CDN-Cache-Control'], 'no-store');
});

test('catalog products returns an uncached 503 when no database URL is configured', async () => {
  const originalDatabaseUrl = process.env.NETLIFY_DATABASE_URL;
  const originalLegacyDatabaseUrl = process.env.NETLIFY_DB_URL;
  delete process.env.NETLIFY_DATABASE_URL;
  delete process.env.NETLIFY_DB_URL;

  try {
    const handler = catalogProducts.createCatalogProductsHandler
      ? catalogProducts.createCatalogProductsHandler()
      : catalogProducts.handler;
    const response = await handler({ httpMethod: 'GET' });

    assert.equal(response.statusCode, 503);
    assert.deepEqual(JSON.parse(response.body), { error: 'Catalog temporarily unavailable' });
    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.equal(response.headers['Netlify-CDN-Cache-Control'], 'no-store');
  } finally {
    if (originalDatabaseUrl === undefined) delete process.env.NETLIFY_DATABASE_URL;
    else process.env.NETLIFY_DATABASE_URL = originalDatabaseUrl;
    if (originalLegacyDatabaseUrl === undefined) delete process.env.NETLIFY_DB_URL;
    else process.env.NETLIFY_DB_URL = originalLegacyDatabaseUrl;
  }
});
