import assert from 'node:assert/strict';
import test from 'node:test';

import { createAdminProductsHandler } from '../../netlify/functions/admin-products.js';

const authenticated = async () => true;
const validProduct = {
  slug: 'navrik-canopy-adventure',
  name: 'Navrik Canopy — Adventure',
  category: 'canopy',
  size: 'Adventure',
  color: 'black',
  gallery_urls: [],
};

test('admin product creation rejects non-canopies before a database write', async () => {
  const handler = createAdminProductsHandler({
    verifyToken: authenticated,
    getSql: () => { throw new Error('database must not be opened for invalid input'); },
  });

  const response = await handler({
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ ...validProduct, category: 'tray' }),
  });

  assert.equal(response.statusCode, 400);
});

test('admin product creation rejects retired price and purchase fields', async () => {
  let databaseCalls = 0;
  const handler = createAdminProductsHandler({
    verifyToken: authenticated,
    getSql: () => async () => { databaseCalls += 1; return []; },
  });

  for (const retired of [{ base_price: 100 }, { purchase_mode: 'quote_only' }, { tray_type: null }]) {
    const response = await handler({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({ ...validProduct, ...retired }),
    });
    assert.equal(response.statusCode, 400);
  }
  assert.equal(databaseCalls, 0);
});

test('admin product creation persists a canopy and refreshes only product caches', async () => {
  const queries = [];
  const values = [];
  const rebuilds = [];
  const purges = [];
  const sql = async (strings, ...parameters) => {
    queries.push(strings.join(' '));
    values.push(parameters);
    return [{ id: 1, ...validProduct }];
  };
  const handler = createAdminProductsHandler({
    verifyToken: authenticated,
    getSql: () => sql,
    rebuild: async (_sql, sections) => { rebuilds.push(sections); },
    purgeTags: async (tags) => { purges.push(tags); },
  });

  const response = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify(validProduct) });

  assert.equal(response.statusCode, 201);
  assert.equal(queries.length, 1);
  assert.match(queries[0], /INSERT INTO catalog_products/);
  assert.doesNotMatch(queries[0], /price|purchase|tray/i);
  assert.ok(values[0].includes('canopy'));
  assert.deepEqual(rebuilds, [['products']]);
  assert.deepEqual(purges, [['catalogue:products', 'catalogue:storefront']]);
});

test('admin product variants cannot carry price fields', async () => {
  let databaseCalls = 0;
  const handler = createAdminProductsHandler({
    verifyToken: authenticated,
    getSql: () => async () => { databaseCalls += 1; return []; },
  });

  const response = await handler({
    httpMethod: 'PUT',
    headers: {},
    body: JSON.stringify({
      variant: true,
      product_id: 1,
      variant_type: 'finish',
      variant_value: 'black',
      label: 'Black',
      price_delta: 100,
    }),
  });

  assert.equal(response.statusCode, 400);
  assert.equal(databaseCalls, 0);
});
