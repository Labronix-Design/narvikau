import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminCategoriesHandler } from '../../netlify/functions/admin-categories.js';
import { createAdminProductsHandler } from '../../netlify/functions/admin-products.js';

test('category, product and variant reject zero or negative positions before opening the database', async () => {
  const deps = { verifyToken: async () => true, getSql: () => { throw new Error('unexpected database access'); } };
  const category = createAdminCategoriesHandler(deps);
  const products = createAdminProductsHandler(deps);
  for (const position of [0, -1]) {
    const cases = [
      [category, 'POST', { slug: 'accessories', name: 'Accessories', sort_order: position }],
      [products, 'POST', { slug: 'accessory', name: 'Accessory', category: 'accessories', sort_order: position }],
      [products, 'PUT', { variant: true, product_id: 1, variant_type: 'finish', variant_value: 'black', label: 'Black', sort_order: position }],
    ];
    for (const [handler, method, body] of cases) {
      assert.equal((await handler({ httpMethod: method, body: JSON.stringify(body) })).statusCode, 400);
    }
  }
});

test('a product write is refused when the database cannot atomically rebuild the catalogue', async () => {
  let writes = 0;
  const sql = async (strings) => {
    if (strings.join(' ').includes('catalog_categories')) return [{ slug: 'accessories', is_active: true }];
    writes += 1;
    return [{ id: 1 }];
  };
  const handler = createAdminProductsHandler({ verifyToken: async () => true, getSql: () => sql, rebuild: async () => {}, purgeTags: async () => {} });
  const result = await handler({ httpMethod: 'POST', body: JSON.stringify({ slug: 'accessory', name: 'Accessory', category: 'accessories', sort_order: 1 }) });
  assert.equal(result.statusCode, 500);
  assert.equal(writes, 0);
});

test('a transaction conflict retries before returning the saved product and purging', async () => {
  let attempts = 0;
  let purges = 0;
  const sql = async () => [{ slug: 'accessories', is_active: true }];
  sql.transaction = async (callback) => {
    attempts += 1;
    if (attempts === 1) throw Object.assign(new Error('conflict'), { code: '40001' });
    const tx = (strings) => Promise.resolve(strings.join(' ').includes('INSERT INTO catalog_products') ? [{ id: 5 }] : []);
    return Promise.all(callback(tx));
  };
  const handler = createAdminProductsHandler({ verifyToken: async () => true, getSql: () => sql, purgeTags: async () => { purges += 1; } });
  const result = await handler({ httpMethod: 'POST', body: JSON.stringify({ slug: 'accessory', name: 'Accessory', category: 'accessories', sort_order: 1 }) });
  assert.equal(result.statusCode, 201);
  assert.equal(attempts, 2);
  assert.equal(purges, 1);
});

test('category and product writes acquire the shared transaction lock before taking the mutation snapshot', async () => {
  for (const [factory, method, body] of [
    [createAdminCategoriesHandler, 'POST', { slug: 'accessories', name: 'Accessories', sort_order: 1 }],
    [createAdminProductsHandler, 'POST', { slug: 'accessory', name: 'Accessory', category: 'accessories', sort_order: 1 }],
  ]) {
    const captured = [];
    let isolation;
    const sql = async () => [{ slug: 'accessories', is_active: true }];
    sql.transaction = async (callback, options) => {
      isolation = options.isolationLevel;
      const tx = (strings) => {
        const query = strings.join('?');
        captured.push(query);
        return Promise.resolve(query.includes('INSERT INTO catalog_categories') || query.includes('INSERT INTO catalog_products') ? [{ id: 5 }] : []);
      };
      return Promise.all(callback(tx));
    };
    const handler = factory({ verifyToken: async () => true, getSql: () => sql, purgeTags: async () => {} });
    assert.equal((await handler({ httpMethod: method, body: JSON.stringify(body) })).statusCode, 201);
    assert.match(captured[0], /pg_advisory_xact_lock/);
    assert.match(captured[1], /INSERT INTO catalog_/);
    assert.equal(isolation, 'ReadCommitted');
  }
});

test('a failed catalogue snapshot does not trigger a public cache purge', async () => {
  let purges = 0;
  const sql = async () => [{ slug: 'accessories', is_active: true }];
  sql.transaction = async (callback) => {
    const tx = (strings) => strings.join(' ').includes('INSERT INTO catalogue_read_models')
      ? Promise.reject(new Error('snapshot unavailable')) : Promise.resolve([{ id: 5 }]);
    return Promise.all(callback(tx));
  };
  const handler = createAdminProductsHandler({ verifyToken: async () => true, getSql: () => sql, purgeTags: async () => { purges += 1; } });
  const result = await handler({ httpMethod: 'POST', body: JSON.stringify({ slug: 'accessory', name: 'Accessory', category: 'accessories', sort_order: 1 }) });
  assert.equal(result.statusCode, 500);
  assert.equal(purges, 0);
});

test('a category slug conflict with a different saved position is not mistaken for a retry', async () => {
  let purges = 0;
  const sql = async () => [{ id: 5, slug: 'accessories', name: 'Accessories', description: null, sort_order: 1, is_active: true }];
  sql.transaction = async () => { throw Object.assign(new Error('duplicate'), { code: '23505' }); };
  const handler = createAdminCategoriesHandler({ verifyToken: async () => true, getSql: () => sql, purgeTags: async () => { purges += 1; } });
  const result = await handler({ httpMethod: 'POST', body: JSON.stringify({ slug: 'accessories', name: 'Accessories', sort_order: 100000 }) });
  assert.equal(result.statusCode, 409);
  assert.equal(purges, 0);
});

test('a clamped category creation retry is recognised by its original requested and saved positions', async () => {
  let purges = 0;
  const sql = async () => [{ id: 5, slug: 'accessories', name: 'Accessories', description: null,
    sort_order: 1, is_active: true, creation_requested_position: 100000, creation_saved_position: 1 }];
  sql.transaction = async () => { throw Object.assign(new Error('duplicate'), { code: '23505' }); };
  const handler = createAdminCategoriesHandler({ verifyToken: async () => true, getSql: () => sql, purgeTags: async () => { purges += 1; } });
  const result = await handler({ httpMethod: 'POST', body: JSON.stringify({ slug: 'accessories', name: 'Accessories', sort_order: 100000 }) });
  assert.equal(result.statusCode, 200);
  assert.equal(purges, 1);
});

test('a creation retry cannot silently accept a category since moved to a different position', async () => {
  const sql = async () => [{ id: 5, slug: 'accessories', name: 'Accessories', description: null,
    sort_order: 2, is_active: true, creation_requested_position: 100000, creation_saved_position: 1 }];
  sql.transaction = async () => { throw Object.assign(new Error('duplicate'), { code: '23505' }); };
  const handler = createAdminCategoriesHandler({ verifyToken: async () => true, getSql: () => sql, purgeTags: async () => {} });
  const result = await handler({ httpMethod: 'POST', body: JSON.stringify({ slug: 'accessories', name: 'Accessories', sort_order: 100000 }) });
  assert.equal(result.statusCode, 409);
});

test('a different original insertion request does not masquerade as a creation retry', async () => {
  const sql = async () => [{ id: 5, slug: 'accessories', name: 'Accessories', description: null,
    sort_order: 1, is_active: true, creation_requested_position: 2, creation_saved_position: 1 }];
  sql.transaction = async () => { throw Object.assign(new Error('duplicate'), { code: '23505' }); };
  const handler = createAdminCategoriesHandler({ verifyToken: async () => true, getSql: () => sql, purgeTags: async () => {} });
  const result = await handler({ httpMethod: 'POST', body: JSON.stringify({ slug: 'accessories', name: 'Accessories', sort_order: 100000 }) });
  assert.equal(result.statusCode, 409);
});

test('omitting position on metadata updates preserves the existing position', async () => {
  const sql = async () => [{ slug: 'accessories', is_active: true }];
  sql.transaction = async (callback) => {
    const tx = (strings, ...values) => {
      const query = strings.join('?');
      if (query.includes('UPDATE catalog_categories') || query.includes('UPDATE catalog_products') || query.includes('UPDATE product_variants')) {
        const position = query.includes('COALESCE') && !values.includes(100000) ? 2 : 100000;
        return Promise.resolve([{ id: 5, sort_order: position }]);
      }
      return Promise.resolve([]);
    };
    return Promise.all(callback(tx));
  };
  const deps = { verifyToken: async () => true, getSql: () => sql, purgeTags: async () => {} };
  for (const [handler, body] of [
    [createAdminCategoriesHandler(deps), { id: 5, slug: 'accessories', name: 'Accessories' }],
    [createAdminProductsHandler(deps), { id: 5, slug: 'accessory', name: 'Accessory', category: 'accessories' }],
    [createAdminProductsHandler(deps), { variant: true, id: 5, product_id: 1, variant_type: 'finish', variant_value: 'black', label: 'Black' }],
  ]) {
    const result = await handler({ httpMethod: 'PUT', body: JSON.stringify(body) });
    assert.equal(result.statusCode, 200);
    assert.equal(JSON.parse(result.body).sort_order, 2);
  }
});
