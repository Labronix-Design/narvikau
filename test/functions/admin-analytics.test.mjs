import assert from 'node:assert/strict';
import test from 'node:test';

import { createHandler } from '../../netlify/functions/admin-analytics.js';

test('admin analytics reads the cached enquiry snapshot and never rebuilds it from orders', async () => {
  const queries = [];
  const sql = async (strings) => {
    const query = strings.join(' ');
    queries.push(query);
    return [{ payload: { status: 'ready', enquiryCount: 4 }, updated_at: '2026-08-24T05:00:00.000Z', invalidated_at: null }];
  };
  const handler = createHandler({ verifyAdminToken: async () => true, getSql: () => sql });

  const response = await handler({ httpMethod: 'GET', headers: { authorization: 'Bearer session' }, queryStringParameters: { type: 'enquiries' } });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  assert.equal(response.headers.Pragma, 'no-cache');
  assert.deepEqual(JSON.parse(response.body), {
    status: 'ready',
    data: { status: 'ready', enquiryCount: 4 },
    cache: { status: 'ready', updatedAt: '2026-08-24T05:00:00.000Z' },
  });
  assert.equal(queries.length, 1);
  assert.match(queries[0], /control_centre_cache/);
  assert.doesNotMatch(queries[0], /FROM orders/);
});

test('admin analytics reports a stale snapshot as not measured instead of rebuilding it', async () => {
  const handler = createHandler({ verifyAdminToken: async () => true, getSql: () => async () => [{ payload: { status: 'ready', enquiryCount: 4 }, updated_at: '2026-08-24T05:00:00.000Z', invalidated_at: '2026-08-24T06:00:00.000Z' }] });

  const response = await handler({ httpMethod: 'GET', headers: { authorization: 'Bearer session' }, queryStringParameters: { type: 'enquiries' } });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    status: 'not_measured',
    explanation: 'Enquiry analytics is awaiting an authenticated refresh.',
    data: null,
    cache: { status: 'stale', updatedAt: '2026-08-24T05:00:00.000Z' },
  });
});

test('retired revenue requests are rejected without a client-triggered database query', async () => {
  let calls = 0;
  const handler = createHandler({ verifyAdminToken: async () => true, getSql: () => async () => { calls += 1; return []; } });

  const response = await handler({ httpMethod: 'GET', headers: { authorization: 'Bearer session' }, queryStringParameters: { type: 'revenue_trend' } });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(response.body), { error: 'Unknown analytics type' });
  assert.equal(calls, 0);
});
