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

function addTransaction(sql, execute) {
  sql.transaction = async (buildQueries, options) => {
    assert.equal(options.isolationLevel, 'ReadCommitted');
    const tx = (strings, ...values) => ({ query: strings.join('?'), values });
    const queries = buildQueries(tx);
    assert.equal(queries.length, 4);
    assert.match(queries[0].query, /pg_advisory_xact_lock/);
    const results = [[]];
    for (const [index, query] of queries.slice(1).entries()) results.push(await execute(query, index));
    return results;
  };
  return sql;
}

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
  const purges = [];
  const longSlug = 'a'.repeat(120);
  const row = { id: 7, ...category, slug: longSlug };
  const sql = addTransaction(
    async (strings, ...values) => {
      queries.push({ query: strings.join('?'), values });
      return [row, { ...row, id: 8, is_active: false }];
    },
    (query, index) => {
      queries.push(query);
      return index === 0 ? [row] : [];
    },
  );
  const handler = createAdminCategoriesHandler({
    verifyToken: async () => true,
    getSql: () => sql,
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
  assert.match(queries[2].query, /INSERT INTO catalogue_read_models/);
  assert.match(queries[2].query, /'products'/);
  assert.match(queries[3].query, /INSERT INTO catalogue_read_models/);
  assert.match(queries[3].query, /'categories'/);
  assert.deepEqual(purges, [['catalogue:products', 'catalogue:categories', 'catalogue:storefront']]);
});

test('category update validates its id and fields, then refreshes both cache sections', async () => {
  const queries = [];
  const purges = [];
  const sql = addTransaction(async () => [], (query, index) => {
    queries.push(query);
    return index === 0 ? [{ id: 7, ...category, name: 'Adventure Canopies' }] : [];
  });
  const handler = createAdminCategoriesHandler({
    verifyToken: async () => true,
    getSql: () => sql,
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
  assert.match(queries[1].query, /'products'/);
  assert.match(queries[2].query, /'categories'/);
  assert.deepEqual(purges, [['catalogue:products', 'catalogue:categories', 'catalogue:storefront']]);
});

test('duplicate category slug and referenced category deletion return client-safe 409 responses', async () => {
  for (const [method, body, code] of [
    ['POST', category, '23505'],
    ['DELETE', { id: 7 }, '23503'],
  ]) {
    const purges = [];
    const sql = addTransaction(async () => [], () => {
      const error = new Error('internal database detail');
      error.code = code;
      throw error;
    });
    const handler = createAdminCategoriesHandler({
      verifyToken: async () => true,
      getSql: () => sql,
      purgeTags: async (tags) => purges.push(tags),
    });
    const result = await handler(request(method, body));
    assert.equal(result.statusCode, 409);
    assert.doesNotMatch(result.body, /internal database detail/);
    assert.deepEqual(purges, []);
  }
});

test('category deletion permits only a numeric id and refreshes caches after deletion', async () => {
  const queries = [];
  const purges = [];
  const sql = addTransaction(async () => [], (query, index) => {
    queries.push(query);
    return index === 0 ? [{ id: 7 }] : [];
  });
  const handler = createAdminCategoriesHandler({
    verifyToken: async () => true,
    getSql: () => sql,
    purgeTags: async (tags) => purges.push(tags),
  });
  assert.equal((await handler(request('DELETE', { id: 7, slug: 'canopy' }))).statusCode, 400);
  assert.equal((await handler(request('DELETE', { id: '7' }))).statusCode, 400);
  assert.equal(queries.length, 0);
  const deleted = await handler(request('DELETE', { id: 7 }));
  assert.equal(deleted.statusCode, 200);
  assert.match(queries[0].query, /DELETE FROM catalog_categories WHERE id =/);
  assert.deepEqual(queries[0].values, [7]);
  assert.match(queries[1].query, /'products'/);
  assert.match(queries[2].query, /'categories'/);
  assert.deepEqual(purges, [['catalogue:products', 'catalogue:categories', 'catalogue:storefront']]);
});

function transactionalCategoryDatabase(initialCategories = [], { failSnapshot = true } = {}) {
  let committed = {
    categories: structuredClone(initialCategories),
    snapshots: {
      products: [],
      categories: structuredClone(initialCategories).filter((row) => row.is_active),
    },
    snapshotWrites: 0,
  };
  let failSnapshotOnce = failSnapshot;

  function execute(state, strings, values) {
    const query = strings.join('?');
    if (query.includes('INSERT INTO catalog_categories')) {
      const slug = values[0];
      if (state.categories.some((row) => row.slug === slug)) {
        const error = new Error('duplicate slug');
        error.code = '23505';
        throw error;
      }
      const row = { id: 7, slug, name: values[1], description: values[2], sort_order: values[3], is_active: values[4] };
      state.categories.push(row);
      return [row];
    }
    if (query.includes('DELETE FROM catalog_categories')) {
      const index = state.categories.findIndex((row) => row.id === values[0]);
      if (index < 0) return [];
      const [row] = state.categories.splice(index, 1);
      return [{ id: row.id }];
    }
    if (query.includes('SELECT id, slug, name, description, sort_order, is_active, created_at, updated_at')
      && query.includes('WHERE slug =')) {
      return state.categories.filter((row) => row.slug === values[0]);
    }
    if (query.includes('INSERT INTO catalogue_read_models')) {
      if (failSnapshotOnce && query.includes("SELECT 'categories'")) {
        failSnapshotOnce = false;
        throw new Error('snapshot write unavailable');
      }
      const section = query.includes("'products'") ? 'products' : 'categories';
      state.snapshots[section] = section === 'products'
        ? []
        : structuredClone(state.categories.filter((row) => row.is_active));
      state.snapshotWrites += 1;
      return [];
    }
    throw new Error(`Unexpected SQL: ${query}`);
  }

  const sql = async (strings, ...values) => execute(committed, strings, values);
  sql.transaction = async (buildQueries, options) => {
    assert.equal(options.isolationLevel, 'ReadCommitted');
    const working = structuredClone(committed);
    const tx = (strings, ...values) => ({ strings, values });
    const results = [];
    const queries = buildQueries(tx);
    assert.equal(queries.length, 4);
    assert.match(queries[0].strings.join('?'), /pg_advisory_xact_lock/);
    results.push([]);
    for (const query of queries.slice(1)) results.push(execute(working, query.strings, query.values));
    committed = working;
    return results;
  };
  return { sql, state: () => structuredClone(committed) };
}

test('failed category creation snapshot rolls back its category row and retry succeeds', async () => {
  const database = transactionalCategoryDatabase();
  const purges = [];
  const handler = createAdminCategoriesHandler({
    verifyToken: async () => true,
    getSql: () => database.sql,
    purgeTags: async (tags) => purges.push(tags),
  });

  const first = await handler(request('POST', category));
  assert.equal(first.statusCode, 500);
  assert.deepEqual(database.state().categories, []);
  assert.deepEqual(database.state().snapshots.categories, []);
  assert.equal(database.state().snapshotWrites, 0);
  assert.deepEqual(purges, []);

  const retry = await handler(request('POST', category));
  assert.equal(retry.statusCode, 201);
  assert.deepEqual(database.state().categories.map((row) => row.slug), ['canopy']);
  assert.deepEqual(database.state().snapshots.categories.map((row) => row.slug), ['canopy']);
  assert.equal(database.state().snapshotWrites, 2);
  assert.deepEqual(purges, [['catalogue:products', 'catalogue:categories', 'catalogue:storefront']]);
});

test('failed category deletion snapshot retains its category row and retry succeeds', async () => {
  const database = transactionalCategoryDatabase([{ id: 7, ...category }]);
  const purges = [];
  const handler = createAdminCategoriesHandler({
    verifyToken: async () => true,
    getSql: () => database.sql,
    purgeTags: async (tags) => purges.push(tags),
  });

  const first = await handler(request('DELETE', { id: 7 }));
  assert.equal(first.statusCode, 500);
  assert.deepEqual(database.state().categories.map((row) => row.slug), ['canopy']);
  assert.deepEqual(database.state().snapshots.categories.map((row) => row.slug), ['canopy']);
  assert.equal(database.state().snapshotWrites, 0);
  assert.deepEqual(purges, []);

  const retry = await handler(request('DELETE', { id: 7 }));
  assert.equal(retry.statusCode, 200);
  assert.deepEqual(database.state().categories, []);
  assert.deepEqual(database.state().snapshots.categories, []);
  assert.equal(database.state().snapshotWrites, 2);
  assert.deepEqual(purges, [['catalogue:products', 'catalogue:categories', 'catalogue:storefront']]);
});

test('category creation can retry a failed CDN purge without a duplicate conflict', async () => {
  const database = transactionalCategoryDatabase([], { failSnapshot: false });
  const purges = [];
  const handler = createAdminCategoriesHandler({
    verifyToken: async () => true,
    getSql: () => database.sql,
    purgeTags: async (tags) => {
      purges.push(tags);
      if (purges.length === 1) throw new Error('CDN unavailable');
    },
  });

  const first = await handler(request('POST', category));
  assert.equal(first.statusCode, 503);
  assert.deepEqual(database.state().categories.map((row) => row.slug), ['canopy']);
  assert.deepEqual(database.state().snapshots.categories.map((row) => row.slug), ['canopy']);

  const retry = await handler(request('POST', category));
  assert.equal(retry.statusCode, 200);
  assert.deepEqual(database.state().categories.map((row) => row.slug), ['canopy']);
  assert.equal(purges.length, 2);
});

test('category deletion can retry a failed CDN purge after the row is gone', async () => {
  const database = transactionalCategoryDatabase([{ id: 7, ...category }], { failSnapshot: false });
  const purges = [];
  const handler = createAdminCategoriesHandler({
    verifyToken: async () => true,
    getSql: () => database.sql,
    purgeTags: async (tags) => {
      purges.push(tags);
      if (purges.length === 1) throw new Error('CDN unavailable');
    },
  });

  const first = await handler(request('DELETE', { id: 7 }));
  assert.equal(first.statusCode, 503);
  assert.deepEqual(database.state().categories, []);
  assert.deepEqual(database.state().snapshots.categories, []);

  const retry = await handler(request('DELETE', { id: 7 }));
  assert.equal(retry.statusCode, 200);
  assert.deepEqual(database.state().categories, []);
  assert.equal(purges.length, 2);
});
