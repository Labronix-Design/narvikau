import assert from 'node:assert/strict';
import test from 'node:test';

import { createHandler, selectInvalidationSections, validateProfile } from '../../netlify/functions/admin-control-centre.js';

const event = (httpMethod, body) => ({
  httpMethod,
  headers: { authorization: 'Bearer valid-session' },
  body: body ? JSON.stringify(body) : '',
});

test('admin-control-centre rejects a refresh without an admin session', async () => {
  const handler = createHandler({ verifyAdminToken: async () => false, getSql: () => async () => [] });

  const response = await handler(event('POST', { action: 'refresh', sections: ['business'] }));

  assert.equal(response.statusCode, 401);
  assert.deepEqual(JSON.parse(response.body), { error: 'Unauthorized' });
});

test('admin-control-centre returns only independently persisted operations snapshots without recomputing metrics', async () => {
  let calls = 0;
  const overviewSnapshot = {
    status: 'ready',
    scope: { enquiries: 'All recorded customer enquiries by their recorded status.' },
    enquiryCount: 4,
    comparison: { status: 'not_measured', explanation: 'No measured comparison period is available.' },
  };
  const sql = async (strings) => {
    calls += 1;
    if (strings.join('').includes('control_centre_cache')) {
      return [
        { section: 'business_overview', payload: overviewSnapshot, updated_at: '2026-08-24T04:00:00.000Z', invalidated_at: null },
        { section: 'enquiries', payload: { status: 'ready', enquiryCount: 4 }, updated_at: '2026-08-24T04:00:00.000Z', invalidated_at: null },
      ];
    }
    return [];
  };
  const handler = createHandler({ verifyAdminToken: async () => true, getSql: () => sql });

  const response = await handler(event('GET'));

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    data: {
      business_overview: overviewSnapshot,
      enquiries: { status: 'ready', enquiryCount: 4 },
      search: { status: 'not_measured', explanation: 'Search Console has not been measured yet.' },
    },
    cache: { status: 'ready', updatedAt: '2026-08-24T04:00:00.000Z' },
    profile: null,
    sections: { business_overview: 'ready', enquiries: 'ready', search: 'not_measured' },
  });
  assert.equal(calls, 2);
});

test('admin-control-centre reports unavailable measurement sections instead of fabricating values', async () => {
  const handler = createHandler({ verifyAdminToken: async () => true, getSql: () => async () => [] });

  const response = await handler(event('GET'));

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    data: {
      business_overview: { status: 'not_measured', explanation: 'Business overview has not been cached yet.' },
      enquiries: { status: 'not_measured', explanation: 'Customer enquiries have not been cached yet.' },
      search: { status: 'not_measured', explanation: 'Search Console has not been measured yet.' },
    },
    cache: { status: 'empty', updatedAt: null },
    profile: null,
    sections: { business_overview: 'not_measured', enquiries: 'not_measured', search: 'not_measured' },
  });
});

test('an authenticated overview refresh reads enquiry operations and rebuilds only that snapshot', async () => {
  const queries = [];
  const sql = async (strings) => {
    const query = strings.join(' ');
    queries.push(query);
    if (query.includes('FROM leads')) {
      return [{ new_enquiries: 1, enquiry_count: 3, converted_enquiries: 1 }];
    }
    if (query.includes("INSERT INTO control_centre_cache")) return [{ updated_at: '2026-08-24T05:00:00.000Z' }];
    return [];
  };
  const handler = createHandler({ verifyAdminToken: async () => true, getSql: () => sql });

  const response = await handler(event('POST', { section: 'business_overview' }));

  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.section, 'business_overview');
  assert.equal(body.data.enquiryCount, 3);
  assert.equal(body.data.scope.enquiries, 'All recorded customer enquiries by their recorded status.');
  assert.deepEqual(body.data.comparison, { status: 'not_measured', explanation: 'No measured comparison period is available.' });
  const metricQuery = queries.find((query) => query.includes('FROM leads'));
  assert.match(metricQuery, /status = 'new'/);
  assert.doesNotMatch(metricQuery, /orders|payment_method|revenue/i);
});

test('an authenticated enquiry refresh reads and writes only the enquiry snapshot', async () => {
  const queries = [];
  const sql = async (strings, ...values) => {
    const query = strings.join(' ');
    queries.push({ query, values });
    if (query.includes('FROM leads')) return [{ enquiry_count: 2, new_enquiries: 1 }];
    if (query.includes('INSERT INTO control_centre_cache')) return [{ updated_at: '2026-08-24T05:00:00.000Z' }];
    return [];
  };
  const handler = createHandler({ verifyAdminToken: async () => true, getSql: () => sql });

  const response = await handler(event('POST', { section: 'enquiries' }));

  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).data.enquiryCount, 2);
  assert.equal(queries.length, 2);
  assert.match(queries[0].query, /FROM leads/);
  assert.doesNotMatch(queries[0].query, /orders|payment_method|revenue/i);
  assert.equal(queries[1].values[0], 'enquiries');
});

test('selectInvalidationSections invalidates operations snapshots only', () => {
  assert.deepEqual(selectInvalidationSections('orders'), []);
  assert.deepEqual(selectInvalidationSections('leads'), ['business_overview', 'enquiries']);
  assert.deepEqual(selectInvalidationSections('google-search'), ['search']);
  assert.deepEqual(selectInvalidationSections('site-settings'), []);
  assert.deepEqual(selectInvalidationSections('business-profile'), []);
  assert.deepEqual(selectInvalidationSections('hosting-observation'), []);
  assert.deepEqual(selectInvalidationSections('unknown-resource'), []);
});

test('validateProfile rejects unknown profile fields instead of persisting client input', () => {
  assert.throws(
    () => validateProfile({ companyName: 'Navrik', internalOnly: true }),
    { message: 'Unknown profile fields' },
  );
});
