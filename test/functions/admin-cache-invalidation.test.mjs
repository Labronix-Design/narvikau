import assert from 'node:assert/strict';
import test from 'node:test';

import { createHandler as createOrdersHandler } from '../../netlify/functions/admin-orders.js';
import { createHandler as createQueriesHandler } from '../../netlify/functions/admin-queries.js';
import { createAdminProductsHandler } from '../../netlify/functions/admin-products.js';
import { createAdminSiteSettingsHandler } from '../../netlify/functions/admin-site-settings.js';
import { createAdminLegalPagesHandler } from '../../netlify/functions/admin-legal-pages.js';
import { createAdminFinancePageHandler } from '../../netlify/functions/admin-finance-page.js';

const request = (body) => ({
  httpMethod: 'PUT',
  headers: { authorization: 'Bearer session' },
  body: JSON.stringify(body),
});

test('a successful order status update invalidates only the affected overview, sales and order snapshots', async () => {
  const invalidated = [];
  let queryCount = 0;
  const sql = async () => (++queryCount === 1 ? [{ id: 42 }] : []);
  const handler = createOrdersHandler({
    verifyAdminToken: async () => true,
    getSql: () => sql,
    invalidateSections: async (_sql, sections) => { invalidated.push(sections); },
  });

  const response = await handler(request({ id: 42, status: 'in_production', notes: 'Scheduled' }));

  assert.equal(response.statusCode, 200);
  assert.deepEqual(invalidated, [['business_overview', 'sales_performance', 'orders']]);
});

test('a missing order returns 404 without an audit write or cache invalidation', async () => {
  const invalidated = [];
  const queries = [];
  const sql = async (strings) => {
    queries.push(strings.join(' '));
    return [];
  };
  const handler = createOrdersHandler({
    verifyAdminToken: async () => true,
    getSql: () => sql,
    invalidateSections: async (_sql, sections) => { invalidated.push(sections); },
  });

  const response = await handler(request({ id: 404, status: 'in_production', notes: 'No record' }));

  assert.equal(response.statusCode, 404);
  assert.deepEqual(JSON.parse(response.body), { error: 'Order not found' });
  assert.deepEqual(invalidated, []);
  assert.equal(queries.length, 1);
  assert.match(queries[0], /UPDATE orders SET/);
  assert.match(queries[0], /RETURNING id/);
});

test('a successful lead status or notes update invalidates only the affected overview, sales and enquiry snapshots', async () => {
  const invalidated = [];
  const sql = async () => [{ id: 8, status: 'contacted', admin_notes: 'Called', updated_at: '2026-08-24T04:00:00.000Z' }];
  const handler = createQueriesHandler({
    verifyAdminToken: async () => true,
    getSql: () => sql,
    invalidateSections: async (_sql, sections) => { invalidated.push(sections); },
  });

  const response = await handler(request({ id: 8, status: 'contacted', admin_notes: 'Called' }));

  assert.equal(response.statusCode, 200);
  assert.deepEqual(invalidated, [['business_overview', 'sales_performance', 'enquiries']]);
});

test('a missing lead is not treated as a successful update and does not invalidate the cache', async () => {
  const invalidated = [];
  const handler = createQueriesHandler({
    verifyAdminToken: async () => true,
    getSql: () => async () => [],
    invalidateSections: async (_sql, sections) => { invalidated.push(sections); },
  });

  const response = await handler(request({ id: 404, admin_notes: 'No record' }));

  assert.equal(response.statusCode, 404);
  assert.deepEqual(invalidated, []);
});

test('admin mutation responses do not advertise wildcard cross-origin access', async () => {
  const handler = createOrdersHandler({ verifyAdminToken: async () => true, getSql: () => async () => [] });

  const response = await handler({ httpMethod: 'GET', headers: {}, queryStringParameters: {} });

  assert.equal(response.headers['Access-Control-Allow-Origin'], undefined);
});

const successfulSql = async () => [{ id: 1, content: { title_main: 'Saved' } }];

const publicMutationCases = [
  {
    name: 'product',
    createHandler: createAdminProductsHandler,
    event: {
      httpMethod: 'POST',
      body: JSON.stringify({ slug: 'navrik-canopy-adventure', name: 'Navrik Canopy — Adventure', category: 'canopy' }),
    },
    expectedStatus: 201,
    expectedTags: ['catalogue:products', 'catalogue:storefront'],
    expectedRebuild: ['products'],
    expectedTimeline: ['write', 'rebuild', 'purge'],
  },
  {
    name: 'site settings',
    createHandler: createAdminSiteSettingsHandler,
    event: {
      httpMethod: 'PUT',
      body: JSON.stringify({ font_family: 'Inter', primary_color: '#112233' }),
    },
    expectedStatus: 200,
    expectedTags: ['site-settings', 'catalogue:storefront'],
    expectedRebuild: undefined,
    expectedTimeline: ['write', 'purge'],
  },
  {
    name: 'refund legal page',
    createHandler: createAdminLegalPagesHandler,
    event: {
      httpMethod: 'PUT',
      queryStringParameters: { page: 'refund' },
      body: JSON.stringify({ title_main: 'Refund policy' }),
    },
    expectedStatus: 200,
    expectedTags: ['legal:refund'],
    expectedRebuild: undefined,
    expectedTimeline: ['write', 'purge'],
  },
  {
    name: 'terms legal page',
    createHandler: createAdminLegalPagesHandler,
    event: {
      httpMethod: 'PUT',
      queryStringParameters: { page: 'terms' },
      body: JSON.stringify({ title_main: 'Terms' }),
    },
    expectedStatus: 200,
    expectedTags: ['legal:terms'],
    expectedRebuild: undefined,
    expectedTimeline: ['write', 'purge'],
  },
  {
    name: 'finance page',
    createHandler: createAdminFinancePageHandler,
    event: {
      httpMethod: 'PUT',
      body: JSON.stringify({ title: 'Finance' }),
    },
    expectedStatus: 200,
    expectedTags: ['finance-page'],
    expectedRebuild: undefined,
    expectedTimeline: ['write', 'purge'],
  },
];

for (const mutationCase of publicMutationCases) {
  test(`a successful ${mutationCase.name} write purges only its exact public cache tags after persistence`, async () => {
    const timeline = [];
    const purgeCalls = [];
    let actualRebuild;
    const handler = mutationCase.createHandler({
      verifyToken: async () => true,
      getSql: () => async (...args) => {
        timeline.push('write');
        return successfulSql(...args);
      },
      rebuild: async (_sql, sections) => { timeline.push('rebuild'); actualRebuild = sections; },
      purgeTags: async (...args) => {
        timeline.push('purge');
        purgeCalls.push(args);
      },
    });

    const context = { clientContext: { custom: { purge_api_token: 'lambda-secret' } } };
    const response = await handler({ headers: {}, ...mutationCase.event }, context);

    assert.equal(response.statusCode, mutationCase.expectedStatus);
    assert.deepEqual(purgeCalls, [[mutationCase.expectedTags]]);
    assert.deepEqual(timeline, mutationCase.expectedTimeline);
    if (mutationCase.expectedRebuild) assert.deepEqual(actualRebuild, mutationCase.expectedRebuild);
  });
}

test('product variants rebuild and purge only the product-related snapshots', async () => {
  const rebuilds = [];
  const purges = [];
  const handler = createAdminProductsHandler({
    verifyToken: async () => true,
    getSql: () => async () => [{ id: 17, product_id: 4 }],
    rebuild: async (_sql, sections) => { rebuilds.push(sections); },
    purgeTags: async (tags) => { purges.push(tags); },
  });

  const response = await handler({
    httpMethod: 'PUT',
    headers: {},
    body: JSON.stringify({ variant: true, id: 17, product_id: 4, variant_type: 'finish', variant_value: 'black', label: 'Black' }),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(rebuilds, [['products']]);
  assert.deepEqual(purges, [['catalogue:products', 'catalogue:storefront']]);
});

for (const sourceMutation of [
  {
    name: 'product update',
    createHandler: createAdminProductsHandler,
    event: { httpMethod: 'PUT', body: JSON.stringify({ id: 4, slug: 'navrik-canopy-adventure', name: 'Navrik Canopy — Adventure', category: 'canopy' }) },
    rebuild: ['products'],
    tags: ['catalogue:products', 'catalogue:storefront'],
  },
  {
    name: 'product delete',
    createHandler: createAdminProductsHandler,
    event: { httpMethod: 'DELETE', body: JSON.stringify({ id: 4 }) },
    rebuild: ['products'],
    tags: ['catalogue:products', 'catalogue:storefront'],
  },
]) {
  test(`a successful direct ${sourceMutation.name} refreshes only its related snapshots`, async () => {
    const rebuilds = [];
    const purges = [];
    const handler = sourceMutation.createHandler({
      verifyToken: async () => true,
      getSql: () => async () => [{ id: 4 }],
      rebuild: async (_sql, sections) => { rebuilds.push(sections); },
      purgeTags: async (tags) => { purges.push(tags); },
    });

    const response = await handler({ headers: {}, ...sourceMutation.event });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(rebuilds, [sourceMutation.rebuild]);
    assert.deepEqual(purges, [sourceMutation.tags]);
  });
}

test('every default admin mutation path passes the Lambda purge token with only its exact tags', async () => {
  const previousFetch = globalThis.fetch;
  const previousSiteId = process.env.SITE_ID;
  const previousPurgeToken = process.env.NETLIFY_PURGE_API_TOKEN;
  const previousLocal = process.env.NETLIFY_LOCAL;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true };
  };
  process.env.SITE_ID = 'site-test';
  delete process.env.NETLIFY_PURGE_API_TOKEN;
  delete process.env.NETLIFY_LOCAL;

  try {
    const context = { clientContext: { custom: { purge_api_token: 'lambda-secret' } } };
    for (const mutationCase of publicMutationCases) {
      const handler = mutationCase.createHandler({
        verifyToken: async () => true,
        getSql: () => successfulSql,
        rebuild: async () => {},
      });
      const requestBody = JSON.parse(mutationCase.event.body);
      const response = await handler({
        headers: {},
        ...mutationCase.event,
        body: JSON.stringify(mutationCase.name === 'product' ? requestBody : { ...requestBody, purge_api_token: 'request-controlled-secret' }),
      }, context);

      assert.equal(response.statusCode, mutationCase.expectedStatus, mutationCase.name);
    }

    assert.equal(requests.length, publicMutationCases.length);
    assert.deepEqual(
      requests.map(({ options }) => JSON.parse(options.body).cache_tags),
      publicMutationCases.map(({ expectedTags }) => expectedTags),
    );
    for (const request of requests) {
      assert.equal(request.url, 'https://api.netlify.com/api/v1/purge');
      assert.equal(request.options.headers.Authorization, 'Bearer lambda-secret');
      assert.equal(JSON.parse(request.options.body).site_id, 'site-test');
    }
  } finally {
    globalThis.fetch = previousFetch;
    if (previousSiteId === undefined) delete process.env.SITE_ID;
    else process.env.SITE_ID = previousSiteId;
    if (previousPurgeToken === undefined) delete process.env.NETLIFY_PURGE_API_TOKEN;
    else process.env.NETLIFY_PURGE_API_TOKEN = previousPurgeToken;
    if (previousLocal === undefined) delete process.env.NETLIFY_LOCAL;
    else process.env.NETLIFY_LOCAL = previousLocal;
  }
});

const missingPublicMutationCases = [
  {
    name: 'product update',
    createHandler: createAdminProductsHandler,
    event: { httpMethod: 'PUT', body: JSON.stringify({ id: 404, slug: 'navrik-canopy-adventure', name: 'Navrik Canopy — Adventure', category: 'canopy' }) },
  },
  {
    name: 'product variant update',
    createHandler: createAdminProductsHandler,
    event: { httpMethod: 'PUT', body: JSON.stringify({ variant: true, id: 404, product_id: 4, variant_type: 'finish', variant_value: 'black', label: 'Black' }) },
  },
  {
    name: 'product delete',
    createHandler: createAdminProductsHandler,
    event: { httpMethod: 'DELETE', body: JSON.stringify({ id: 404 }) },
  },
  {
    name: 'product variant delete',
    createHandler: createAdminProductsHandler,
    event: { httpMethod: 'DELETE', body: JSON.stringify({ variant: true, id: 404 }) },
  },
  {
    name: 'site settings update',
    createHandler: createAdminSiteSettingsHandler,
    event: { httpMethod: 'PUT', body: JSON.stringify({ font_family: 'Inter', primary_color: '#112233' }) },
  },
  {
    name: 'finance page update',
    createHandler: createAdminFinancePageHandler,
    event: { httpMethod: 'PUT', body: JSON.stringify({ title: 'Finance' }) },
  },
];

for (const mutationCase of missingPublicMutationCases) {
  test(`a missing ${mutationCase.name} returns 404 without a rebuild or public purge`, async () => {
    const rebuilt = [];
    const purged = [];
    const handler = mutationCase.createHandler({
      verifyToken: async () => true,
      getSql: () => async () => [],
      rebuild: async (...args) => { rebuilt.push(args); },
      purgeTags: async (tags) => { purged.push(tags); },
    });

    const response = await handler({ headers: {}, ...mutationCase.event });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(rebuilt, []);
    assert.deepEqual(purged, []);
  });
}

test('a public cache purge failure is visible after a successful product write', async () => {
  const handler = createAdminProductsHandler({
    verifyToken: async () => true,
    getSql: () => successfulSql,
    rebuild: async () => {},
    purgeTags: async () => { throw new Error('edge unavailable'); },
  });

  const response = await handler({
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ slug: 'navrik-canopy-adventure', name: 'Navrik Canopy — Adventure', category: 'canopy' }),
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(JSON.parse(response.body), { error: 'Your catalogue change was saved, but the storefront refresh is pending. Please retry shortly.' });
});
