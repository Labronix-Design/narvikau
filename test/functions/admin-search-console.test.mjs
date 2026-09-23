import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { createHandler, refreshMonthlySearchConsoleSnapshot } from '../../netlify/functions/admin-search-console.js';

const event = (httpMethod, body) => ({
  httpMethod,
  headers: { authorization: 'Bearer valid-session' },
  body: body ? JSON.stringify(body) : '',
});

test('admin-search-console returns a safe setup state when OAuth configuration is missing', async () => {
  const handler = createHandler({
    verifyAdminToken: async () => true,
    getSql: () => async () => [],
    env: {},
  });

  const response = await handler(event('GET'));

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  assert.equal(response.headers.Pragma, 'no-cache');
  assert.deepEqual(JSON.parse(response.body), {
    status: 'setup_required',
    explanation: 'Google Search Console is not connected yet.',
    missingConfiguration: ['GSC_OAUTH_CLIENT_ID', 'GSC_OAUTH_CLIENT_SECRET', 'GSC_OAUTH_REDIRECT_URI', 'GSC_OAUTH_STATE_SECRET', 'GSC_TOKEN_ENCRYPTION_KEY', 'GSC_SITE_URL'],
    data: null,
    cache: { status: 'empty', updatedAt: null },
    integration: { provider: 'google_search_console' },
  });
});

test('admin-search-console rejects a refresh without an admin session', async () => {
  const handler = createHandler({ verifyAdminToken: async () => false, getSql: () => async () => [], env: {} });

  const response = await handler(event('POST', { action: 'refresh' }));

  assert.equal(response.statusCode, 401);
  assert.deepEqual(JSON.parse(response.body), { error: 'Unauthorized' });
});

test('monthly Search Console snapshot reports setup-required without querying Google when credentials are unavailable', async () => {
  let sqlCalls = 0;
  const result = await refreshMonthlySearchConsoleSnapshot({
    sql: async () => { sqlCalls += 1; return []; },
    period: { startDate: '2026-08-01', endDate: '2026-08-31' },
    env: {},
    fetchImpl: async () => { throw new Error('should not fetch'); },
  });

  assert.equal(result.status, 'setup_required');
  assert.equal(sqlCalls, 0);
});

test('monthly Search Console snapshot reuses its exact server-side period cache without querying Google', async () => {
  let fetchCalls = 0;
  const result = await refreshMonthlySearchConsoleSnapshot({
    sql: async (strings) => {
      const query = strings.join(' ');
      if (query.includes('search_console_monthly_snapshots')) return [{ payload: { status: 'ready', period: { startDate: '2026-08-01', endDate: '2026-08-31' }, metrics: { clicks: 5 } } }];
      throw new Error('unexpected query');
    },
    period: { startDate: '2026-08-01', endDate: '2026-08-31' },
    env: {
      GSC_OAUTH_CLIENT_ID: 'client', GSC_OAUTH_CLIENT_SECRET: 'secret',
      GSC_OAUTH_REDIRECT_URI: 'https://www.navrik.co.za/api/admin-search-console?action=callback',
      GSC_OAUTH_STATE_SECRET: 'state', GSC_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'), GSC_SITE_URL: 'sc-domain:navrik.co.za',
    },
    fetchImpl: async () => { fetchCalls += 1; throw new Error('should not fetch'); },
  });

  assert.equal(result.metrics.clicks, 5);
  assert.equal(fetchCalls, 0);
});

test('monthly Search Console snapshot queries the exact server-side calendar period before caching it', async () => {
  const key = Buffer.alloc(32, 7);
  const iv = Buffer.alloc(12, 3);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update('refresh-token', 'utf8'), cipher.final()]);
  const encryptedGrant = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
  const requests = [];
  const sql = async (strings) => {
    const query = strings.join(' ');
    if (query.includes('search_console_monthly_snapshots') && query.includes('SELECT')) return [];
    if (query.includes('gsc_oauth_grants')) return [{ refresh_token_ciphertext: encryptedGrant }];
    if (query.includes('INSERT INTO search_console_monthly_snapshots')) return [];
    throw new Error('unexpected query');
  };
  const fetchImpl = async (url, options) => {
    if (url.includes('oauth2.googleapis.com')) return { ok: true, json: async () => ({ access_token: 'access-token' }) };
    requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ rows: [{ clicks: 12, impressions: 120, ctr: 0.1, position: 4.2, keys: ['/products'] }] }) };
  };

  const result = await refreshMonthlySearchConsoleSnapshot({
    sql,
    period: { startDate: '2026-08-01', endDate: '2026-08-31' },
    env: {
      GSC_OAUTH_CLIENT_ID: 'client', GSC_OAUTH_CLIENT_SECRET: 'secret',
      GSC_OAUTH_REDIRECT_URI: 'https://www.navrik.co.za/api/admin-search-console?action=callback',
      GSC_OAUTH_STATE_SECRET: 'state', GSC_TOKEN_ENCRYPTION_KEY: key.toString('base64'), GSC_SITE_URL: 'sc-domain:navrik.co.za',
    },
    fetchImpl,
  });

  assert.deepEqual(result.period, { startDate: '2026-08-01', endDate: '2026-08-31' });
  assert.equal(requests.filter((request) => request.startDate === '2026-08-01' && request.endDate === '2026-08-31').length, 3);
  assert.equal(requests.some((request) => request.startDate === '2026-07-01' && request.endDate === '2026-07-31'), true);
});

test('a configured GA4 property is refreshed into the same admin-only server cache as Search Console', async () => {
  const key = Buffer.alloc(32, 9);
  const iv = Buffer.alloc(12, 2);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update('refresh-token', 'utf8'), cipher.final()]);
  const encryptedGrant = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
  const requests = [];
  const handler = createHandler({
    verifyAdminToken: async () => true,
    getSql: () => async (strings) => {
      const query = strings.join(' ');
      if (query.includes('SELECT refresh_token_ciphertext FROM gsc_oauth_grants')) return [{ refresh_token_ciphertext: encryptedGrant }];
      if (query.includes('SELECT payload, updated_at, invalidated_at, source FROM control_centre_cache')) return [];
      if (query.includes('INSERT INTO control_centre_cache')) return [{ updated_at: '2026-08-24T04:00:00.000Z' }];
      if (query.includes('UPDATE control_centre_cache') && query.includes('SET payload =')) return [{ updated_at: '2026-08-24T04:00:00.000Z' }];
      throw new Error(`unexpected query: ${query}`);
    },
    env: {
      GSC_OAUTH_CLIENT_ID: 'client', GSC_OAUTH_CLIENT_SECRET: 'secret',
      GSC_OAUTH_REDIRECT_URI: 'https://www.navrik.co.za/api/admin-search-console?action=callback',
      GSC_OAUTH_STATE_SECRET: 'state', GSC_TOKEN_ENCRYPTION_KEY: key.toString('base64'), GSC_SITE_URL: 'sc-domain:navrik.co.za',
      GA4_PROPERTY_ID: '123456789',
    },
    fetchImpl: async (url, options) => {
      if (url.includes('oauth2.googleapis.com')) return { ok: true, json: async () => ({ access_token: 'access-token' }) };
      requests.push(url);
      if (url.includes('analyticsdata.googleapis.com')) {
        assert.match(options.headers.Authorization, /^Bearer /);
        return { ok: true, json: async () => ({ rows: [
          { metricValues: [{ value: '12' }, { value: '20' }, { value: '31' }, { value: '2' }] },
          { metricValues: [{ value: '9' }, { value: '17' }, { value: '23' }, { value: '1' }] },
        ] }) };
      }
      return { ok: true, json: async () => ({ rows: [{ clicks: 12, impressions: 120, ctr: 0.1, position: 4.2, keys: ['/products'] }] }) };
    },
  });

  const response = await handler(event('POST', { action: 'refresh' }));
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(body.data.websiteAnalytics.status, 'ready');
  assert.equal(body.data.websiteAnalytics.metrics.sessions, 20);
  assert.equal(body.data.websiteAnalytics.metrics.keyEvents, 2);
  assert.equal(body.data.websiteAnalytics.comparison.sessions, 17);
  assert.equal(requests.some((url) => url.includes('analyticsdata.googleapis.com/v1beta/properties/123456789:runReport')), true);
});

test('a recent server cache prevents repeated admin refreshes from exhausting Google quota', async () => {
  const handler = createHandler({
    verifyAdminToken: async () => true,
    getSql: () => async (strings) => {
      const query = strings.join(' ');
      if (query.includes('SELECT refresh_token_ciphertext FROM gsc_oauth_grants')) return [{ refresh_token_ciphertext: 'encrypted' }];
      if (query.includes('SELECT payload, updated_at, invalidated_at, source FROM control_centre_cache')) return [{ payload: { status: 'ready', metrics: { clicks: 3 } }, updated_at: '2026-08-24T04:00:00.000Z', invalidated_at: null, source: 'google_search_console' }];
      throw new Error(`unexpected query: ${query}`);
    },
    now: () => new Date('2026-08-24T04:05:00.000Z'),
    env: { GSC_OAUTH_CLIENT_ID: 'client', GSC_OAUTH_CLIENT_SECRET: 'secret', GSC_OAUTH_REDIRECT_URI: 'https://www.navrik.co.za/api/admin-search-console?action=callback', GSC_OAUTH_STATE_SECRET: 'state', GSC_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'), GSC_SITE_URL: 'sc-domain:navrik.co.za' },
    fetchImpl: async () => { throw new Error('Google must not be called during cooldown'); },
  });

  const response = await handler(event('POST', { action: 'refresh' }));
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(body.refresh.status, 'cooldown');
  assert.equal(body.data.metrics.clicks, 3);
});

test('a GET during an active refresh lease retains the last measured payload with stale metadata', async () => {
  const handler = createHandler({
    verifyAdminToken: async () => true,
    getSql: () => async (strings) => {
      const query = strings.join(' ');
      if (query.includes('SELECT id FROM gsc_oauth_grants')) return [{ id: 1 }];
      if (query.includes('SELECT payload, updated_at, invalidated_at, source FROM control_centre_cache')) {
        return [{
          payload: { status: 'ready', metrics: { clicks: 8 } },
          updated_at: '2026-08-24T03:00:00.000Z',
          invalidated_at: '2026-08-24T04:00:00.000Z',
          source: 'google_search_console_refresh:another-request',
        }];
      }
      throw new Error(`unexpected query: ${query}`);
    },
    now: () => new Date('2026-08-24T04:04:00.000Z'),
    env: { GSC_OAUTH_CLIENT_ID: 'client', GSC_OAUTH_CLIENT_SECRET: 'secret', GSC_OAUTH_REDIRECT_URI: 'https://www.navrik.co.za/api/admin-search-console?action=callback', GSC_OAUTH_STATE_SECRET: 'state', GSC_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'), GSC_SITE_URL: 'sc-domain:navrik.co.za' },
  });

  const response = await handler(event('GET'));
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(body.data.metrics.clicks, 8);
  assert.equal(body.cache.status, 'stale');
  assert.equal(body.refresh.status, 'in_progress');
});

test('an overlapping admin refresh observes the database-backed lease and does not call Google twice', async () => {
  let googleCalls = 0;
  let cacheReads = 0;
  const handler = createHandler({
    verifyAdminToken: async () => true,
    getSql: () => async (strings) => {
      const query = strings.join(' ');
      if (query.includes('SELECT refresh_token_ciphertext FROM gsc_oauth_grants')) return [{ refresh_token_ciphertext: 'encrypted' }];
      if (query.includes('SELECT payload, updated_at, invalidated_at, source FROM control_centre_cache')) {
        cacheReads += 1;
        return cacheReads === 1
          ? [{ payload: { status: 'ready', metrics: { clicks: 3 } }, updated_at: '2026-08-24T03:00:00.000Z' }]
          : [{ payload: { status: 'ready', metrics: { clicks: 3 } }, updated_at: '2026-08-24T03:00:00.000Z', invalidated_at: '2026-08-24T04:00:00.000Z', source: 'google_search_console_refresh:another-request' }];
      }
      if (query.includes('INSERT INTO control_centre_cache')) return [];
      throw new Error(`unexpected query: ${query}`);
    },
    now: () => new Date('2026-08-24T04:05:00.000Z'),
    env: { GSC_OAUTH_CLIENT_ID: 'client', GSC_OAUTH_CLIENT_SECRET: 'secret', GSC_OAUTH_REDIRECT_URI: 'https://www.navrik.co.za/api/admin-search-console?action=callback', GSC_OAUTH_STATE_SECRET: 'state', GSC_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'), GSC_SITE_URL: 'sc-domain:navrik.co.za' },
    fetchImpl: async () => { googleCalls += 1; throw new Error('Google must not be called when another refresh owns the lease'); },
  });

  const response = await handler(event('POST', { action: 'refresh' }));
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 202);
  assert.equal(body.refresh.status, 'in_progress');
  assert.equal(body.data.metrics.clicks, 3);
  assert.equal(googleCalls, 0);
});

test('an invalid Google refresh grant is cleared and returns a reconnection state instead of a 502', async () => {
  const key = Buffer.alloc(32, 9);
  const iv = Buffer.alloc(12, 4);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update('expired-refresh-token', 'utf8'), cipher.final()]);
  const encryptedGrant = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
  let grantDeleted = false;
  const handler = createHandler({
    verifyAdminToken: async () => true,
    getSql: () => async (strings) => {
      const query = strings.join(' ');
      if (query.includes('SELECT refresh_token_ciphertext FROM gsc_oauth_grants')) return [{ refresh_token_ciphertext: encryptedGrant }];
      if (query.includes('SELECT payload, updated_at, invalidated_at, source FROM control_centre_cache')) return [];
      if (query.includes('INSERT INTO control_centre_cache')) return [{ payload: {}, updated_at: '2026-09-11T12:00:00.000Z' }];
      if (query.includes('UPDATE control_centre_cache')) return [];
      if (query.includes('DELETE FROM gsc_oauth_grants')) { grantDeleted = true; return []; }
      throw new Error(`unexpected query: ${query}`);
    },
    env: {
      GSC_OAUTH_CLIENT_ID: 'client', GSC_OAUTH_CLIENT_SECRET: 'secret',
      GSC_OAUTH_REDIRECT_URI: 'https://www.navrik.co.za/api/admin-search-console?action=callback',
      GSC_OAUTH_STATE_SECRET: 'state', GSC_TOKEN_ENCRYPTION_KEY: key.toString('base64'), GSC_SITE_URL: 'sc-domain:navrik.co.za',
    },
    fetchImpl: async () => ({ ok: false, json: async () => ({ error: 'invalid_grant' }) }),
  });

  const response = await handler(event('POST', { action: 'refresh' }));
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(body.status, 'setup_required');
  assert.match(body.explanation, /reconnect/i);
  assert.equal(grantDeleted, true);
});
