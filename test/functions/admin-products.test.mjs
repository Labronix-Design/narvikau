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
  specifications: { Material: '5052-grade aluminium' },
};

const accessory = {
  slug: 'navrik-recovery-kit',
  name: 'Navrik Recovery Kit',
  category: 'accessory',
  description: 'A compact vehicle recovery kit.',
  image_url: '/uploads/recovery-kit.jpg',
  is_active: true,
  sort_order: 12,
  gallery_urls: ['/uploads/recovery-kit.jpg'],
  specifications: { Material: 'Nylon', Capacity: '10,000 kg' },
};

test('an authenticated admin can create an accessory product with specifications', async () => {
  const queries = [];
  const values = [];
  const rebuilds = [];
  const purges = [];
  const sql = async (strings, ...parameters) => {
    queries.push(strings.join(' '));
    values.push(parameters);
    return [{ id: 27, ...accessory }];
  };
  const handler = createAdminProductsHandler({
    verifyToken: authenticated,
    getSql: () => sql,
    rebuild: async (_sql, sections) => { rebuilds.push(sections); },
    purgeTags: async (tags) => { purges.push(tags); },
  });

  const response = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify(accessory) });

  assert.equal(response.statusCode, 201);
  assert.match(queries[0], /INSERT INTO catalog_products/);
  assert.match(queries[0], /specifications/);
  assert.ok(values[0].includes('accessory'));
  assert.ok(values[0].includes(JSON.stringify(accessory.specifications)));
  assert.deepEqual(rebuilds, [['products']]);
  assert.deepEqual(purges, [['catalogue:products', 'catalogue:storefront']]);
});

test('an authenticated admin can edit and delete a non-canopy product by product id', async () => {
  const queries = [];
  const sql = async (strings) => {
    const query = strings.join(' ');
    queries.push(query);
    if (query.includes('UPDATE catalog_products')) return [{ id: 27, ...accessory, name: 'Navrik Heavy-Duty Recovery Kit' }];
    return [{ id: 27 }];
  };
  const handler = createAdminProductsHandler({
    verifyToken: authenticated,
    getSql: () => sql,
    rebuild: async () => {},
    purgeTags: async () => {},
  });

  const update = await handler({
    httpMethod: 'PUT',
    headers: {},
    body: JSON.stringify({ ...accessory, id: 27, name: 'Navrik Heavy-Duty Recovery Kit' }),
  });
  const deletion = await handler({ httpMethod: 'DELETE', headers: {}, body: JSON.stringify({ id: 27 }) });

  assert.equal(update.statusCode, 200);
  assert.equal(deletion.statusCode, 200);
  assert.match(queries[0], /UPDATE catalog_products/);
  assert.match(queries[0], /WHERE id =/);
  assert.doesNotMatch(queries[0], /category = 'canopy'/);
  assert.match(queries[1], /DELETE FROM catalog_products WHERE id =/);
  assert.doesNotMatch(queries[1], /category = 'canopy'/);
});

test('admin product creation rejects malformed product fields before a database write', async () => {
  const handler = createAdminProductsHandler({
    verifyToken: authenticated,
    getSql: () => { throw new Error('database must not be opened for invalid input'); },
  });

  for (const invalid of [
    { slug: 'Navrik Recovery Kit' },
    { category: 'Recovery Kits' },
    { specifications: [] },
    { specifications: { Material: { name: 'aluminium' } } },
    { specifications: JSON.parse('{"__proto__":"unsafe"}') },
  ]) {
    const response = await handler({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({ ...accessory, ...invalid }),
    });
    assert.equal(response.statusCode, 400);
  }
});

test('admin product creation rejects price and purchase fields before a database write', async () => {
  let databaseCalls = 0;
  const handler = createAdminProductsHandler({
    verifyToken: authenticated,
    getSql: () => async () => { databaseCalls += 1; return []; },
  });

  for (const retired of [{ price: 100 }, { price_cents: 10000 }, { base_price: 100 }, { purchase_mode: 'quote_only' }, { checkout_id: 'checkout' }, { yoco_checkout_id: 'checkout' }]) {
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
  assert.match(queries[0], /specifications/);
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
