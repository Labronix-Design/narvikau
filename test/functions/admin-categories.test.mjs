import assert from 'node:assert/strict';
import test from 'node:test';

import { createAdminCategoriesHandler } from '../../netlify/functions/admin-categories.js';

const category = { slug: 'canopy', name: 'Canopies', description: 'Vehicle canopies', sort_order: 2, is_active: true };
const request = (httpMethod, body, queryStringParameters) => ({
  httpMethod,
  headers: {},
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  ...(queryStringParameters ? { queryStringParameters } : {}),
});

test('category administration rejects unauthenticated requests before opening the database', async () => {
  const handler = createAdminCategoriesHandler({
    verifyToken: async () => false,
    getSql: () => { throw new Error('database opened'); },
  });
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    assert.equal((await handler(request(method, category))).statusCode, 401);
  }
});

test('category administration guards methods and query parameters', async () => {
  const handler = createAdminCategoriesHandler({
    verifyToken: async () => true,
    getSql: () => { throw new Error('database opened'); },
  });
  assert.equal((await handler(request('PATCH', category))).statusCode, 405);
  assert.equal((await handler(request('GET', undefined, { debug: '1' }))).statusCode, 400);
});

test('category creation rejects unknown fields, malformed slugs and invalid values before SQL', async () => {
  let databaseCalls = 0;
  const handler = createAdminCategoriesHandler({
    verifyToken: async () => true,
    getSql: () => { databaseCalls += 1; return async () => []; },
  });
  const invalid = [
    { ...category, type: 'accessory' },
    { ...category, id: 1 },
    { ...category, slug: 'Canopy' },
    { ...category, slug: 'a'.repeat(121) },
    { ...category, slug: 'canopy--large' },
    { ...category, name: ' ' },
    { ...category, description: 3 },
    { ...category, sort_order: 100001 },
    { ...category, sort_order: '2' },
    { ...category, is_active: 'true' },
  ];
  for (const body of invalid) {
    assert.equal((await handler(request('POST', body))).statusCode, 400, JSON.stringify(body));
  }
  assert.equal((await handler({ httpMethod: 'POST', headers: {}, body: '{' })).statusCode, 400);
  assert.equal(databaseCalls, 0);
});

test('category list includes inactive rows and creation persists a 120-character slug with parameterised SQL', async () => {
  const queries = [];
  const rebuilds = [];
  const purges = [];
  const longSlug = 'a'.repeat(120);
  const row = { id: 7, ...category, slug: longSlug };
  const sql = async (strings, ...values) => {
    queries.push({ query: strings.join('?'), values });
    return queries.length === 1 ? [row, { ...row, id: 8, is_active: false }] : [row];
  };
  const handler = createAdminCategoriesHandler({
    verifyToken: async () => true,
    getSql: () => sql,
    rebuild: async (_sql, sections) => rebuilds.push(sections),
    purgeTags: async (tags) => purges.push(tags),
  });

  const listed = await handler(request('GET'));
  const created = await handler(request('POST', { ...category, slug: longSlug }));

  assert.equal(listed.statusCode, 200);
  assert.equal(JSON.parse(listed.body).length, 2);
  assert.equal(created.statusCode, 201);
  assert.match(queries[0].query, /FROM catalog_categories/);
  assert.match(queries[1].query, /INSERT INTO catalog_categories/);
  assert.doesNotMatch(queries[1].query, new RegExp(longSlug));
  assert.ok(queries[1].values.includes(longSlug));
  assert.deepEqual(rebuilds, [['products', 'categories']]);
  assert.deepEqual(purges, [['catalogue:products', 'catalogue:categories', 'catalogue:storefront']]);
});

test('category update validates its id and fields, then refreshes both cache sections', async () => {
  const queries = [];
  const rebuilds = [];
  const purges = [];
  const sql = async (strings, ...values) => {
    queries.push({ query: strings.join('?'), values });
    return [{ id: 7, ...category, name: 'Adventure Canopies' }];
  };
  const handler = createAdminCategoriesHandler({
    verifyToken: async () => true,
    getSql: () => sql,
    rebuild: async (_sql, sections) => rebuilds.push(sections),
    purgeTags: async (tags) => purges.push(tags),
  });

  for (const invalid of [{ ...category, id: '7' }, { ...category, id: 7, eyebrow: 'new' }]) {
    assert.equal((await handler(request('PUT', invalid))).statusCode, 400);
  }
  assert.equal(queries.length, 0);
  const updated = await handler(request('PUT', { id: 7, ...category, name: 'Adventure Canopies' }));
  assert.equal(updated.statusCode, 200);
  assert.match(queries[0].query, /UPDATE catalog_categories/);
  assert.ok(queries[0].values.includes(7));
  assert.deepEqual(rebuilds, [['products', 'categories']]);
  assert.deepEqual(purges, [['catalogue:products', 'catalogue:categories', 'catalogue:storefront']]);
});

test('duplicate category slug and referenced category deletion return client-safe 409 responses', async () => {
  for (const [method, body, code] of [
    ['POST', category, '23505'],
    ['DELETE', { id: 7 }, '23503'],
  ]) {
    const rebuilds = [];
    const purges = [];
    const handler = createAdminCategoriesHandler({
      verifyToken: async () => true,
      getSql: () => async () => { const error = new Error('internal database detail'); error.code = code; throw error; },
      rebuild: async (_sql, sections) => rebuilds.push(sections),
      purgeTags: async (tags) => purges.push(tags),
    });
    const result = await handler(request(method, body));
    assert.equal(result.statusCode, 409);
    assert.doesNotMatch(result.body, /internal database detail/);
    assert.deepEqual(rebuilds, []);
    assert.deepEqual(purges, []);
  }
});

test('category deletion permits only a numeric id and refreshes caches after deletion', async () => {
  const queries = [];
  const rebuilds = [];
  const purges = [];
  const handler = createAdminCategoriesHandler({
    verifyToken: async () => true,
    getSql: () => async (strings, ...values) => {
      queries.push({ query: strings.join('?'), values });
      return [{ id: 7 }];
    },
    rebuild: async (_sql, sections) => rebuilds.push(sections),
    purgeTags: async (tags) => purges.push(tags),
  });
  assert.equal((await handler(request('DELETE', { id: 7, slug: 'canopy' }))).statusCode, 400);
  assert.equal((await handler(request('DELETE', { id: '7' }))).statusCode, 400);
  assert.equal(queries.length, 0);
  const deleted = await handler(request('DELETE', { id: 7 }));
  assert.equal(deleted.statusCode, 200);
  assert.match(queries[0].query, /DELETE FROM catalog_categories WHERE id =/);
  assert.deepEqual(queries[0].values, [7]);
  assert.deepEqual(rebuilds, [['products', 'categories']]);
  assert.deepEqual(purges, [['catalogue:products', 'catalogue:categories', 'catalogue:storefront']]);
});
