import assert from 'node:assert/strict';
import test from 'node:test';

import { createHandler } from '../../netlify/functions/admin-analytics.js';

test('admin analytics reads the cached sales snapshot and never rebuilds it from orders', async () => {
  const queries = [];
  const sql = async (strings) => {
    const query = strings.join(' ');
    queries.push(query);
    return [{ payload: { status: 'ready', revenueCents: 125000 }, updated_at: '2026-08-24T05:00:00.000Z', invalidated_at: null }];
  };
  const handler = createHandler({ verifyAdminToken: async () => true, getSql: () => sql });

  const response = await handler({ httpMethod: 'GET', headers: { authorization: 'Bearer session' }, queryStringParameters: { type: 'sales_performance' } });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  assert.equal(response.headers.Pragma, 'no-cache');
  assert.deepEqual(JSON.parse(response.body), {
    status: 'ready',
    data: { status: 'ready', revenueCents: 125000 },
    cache: { status: 'ready', updatedAt: '2026-08-24T05:00:00.000Z' },
  });
  assert.equal(queries.length, 1);
  assert.match(queries[0], /control_centre_cache/);
  assert.doesNotMatch(queries[0], /FROM orders/);
});

test('admin analytics reports a stale snapshot as not measured instead of rebuilding it', async () => {
  const handler = createHandler({ verifyAdminToken: async () => true, getSql: () => async () => [{ payload: { status: 'ready', revenueCents: 125000 }, updated_at: '2026-08-24T05:00:00.000Z', invalidated_at: '2026-08-24T06:00:00.000Z' }] });

  const response = await handler({ httpMethod: 'GET', headers: { authorization: 'Bearer session' }, queryStringParameters: { type: 'sales_performance' } });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    status: 'not_measured',
    explanation: 'Sales performance is awaiting an authenticated refresh.',
    data: null,
    cache: { status: 'stale', updatedAt: '2026-08-24T05:00:00.000Z' },
  });
});

test('legacy trend requests safely report not measured without a client-triggered order query', async () => {
  let calls = 0;
  const handler = createHandler({ verifyAdminToken: async () => true, getSql: () => async () => { calls += 1; return []; } });

  const response = await handler({ httpMethod: 'GET', headers: { authorization: 'Bearer session' }, queryStringParameters: { type: 'revenue_trend' } });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    status: 'not_measured',
    explanation: 'This analytics breakdown is not measured in a cached snapshot yet.',
    data: null,
    cache: { status: 'not_measured', updatedAt: null },
  });
  assert.equal(calls, 0);
});
