import assert from 'node:assert/strict';
import test from 'node:test';

import { createHandler, createOAuthStateRecord, validateOAuthStateRecord } from '../../netlify/functions/admin-search-console.js';

const encryptionKey = Buffer.alloc(32, 7).toString('base64');
const configuredEnv = {
  GSC_OAUTH_CLIENT_ID: 'client-id',
  GSC_OAUTH_CLIENT_SECRET: 'super-secret-client-secret',
  GSC_OAUTH_REDIRECT_URI: 'https://navrik.com.au/api/admin-search-console?action=callback',
  GSC_OAUTH_STATE_SECRET: 'super-secret-state-key',
  GSC_TOKEN_ENCRYPTION_KEY: encryptionKey,
  GSC_SITE_URL: 'sc-domain:navrik.com.au',
};

test('OAuth state validation rejects an expired server-side state record', () => {
  const record = createOAuthStateRecord({
    state: 'state-value', verifier: 'verifier-value', env: configuredEnv,
    expiresAt: new Date('2026-08-24T04:05:00.000Z'),
  });

  assert.throws(
    () => validateOAuthStateRecord({ record, state: 'state-value', env: configuredEnv, now: new Date('2026-08-24T04:05:01.000Z') }),
    { message: 'OAuth state has expired' },
  );
});

test('OAuth state validation rejects an invalid state before a token exchange', () => {
  const record = createOAuthStateRecord({
    state: 'state-value', verifier: 'verifier-value', env: configuredEnv,
    expiresAt: new Date('2026-08-24T04:05:00.000Z'),
  });

  assert.throws(
    () => validateOAuthStateRecord({ record, state: 'different-state', env: configuredEnv, now: new Date('2026-08-24T04:00:00.000Z') }),
    { message: 'Invalid OAuth state' },
  );
});

test('missing OAuth configuration returns setup guidance without leaking configured secret values', async () => {
  const handler = createHandler({ verifyAdminToken: async () => true, getSql: () => async () => [], env: { ...configuredEnv, GSC_TOKEN_ENCRYPTION_KEY: '' } });

  const response = await handler({ httpMethod: 'GET', headers: { authorization: 'Bearer admin' }, queryStringParameters: {} });
  const body = response.body;

  assert.equal(response.statusCode, 200);
  assert.match(body, /setup_required/);
  assert.doesNotMatch(body, /super-secret-client-secret|super-secret-state-key|verifier-value|refresh_token/);
});

test('OAuth connect response never exposes the verifier, state secret, or client secret', async () => {
  const handler = createHandler({
    verifyAdminToken: async () => true,
    getSql: () => {
      const sql = async (strings) => strings.join(' ').includes('INSERT INTO gsc_oauth_states') ? [{ state_hash: 'reserved' }] : [];
      sql.transaction = async (queries) => Promise.all(typeof queries === 'function' ? queries(sql) : queries);
      return sql;
    },
    env: configuredEnv,
    randomBytes: (size) => Buffer.alloc(size, 4),
    now: () => new Date('2026-08-24T04:00:00.000Z'),
  });

  const response = await handler({ httpMethod: 'GET', headers: { authorization: 'Bearer admin' }, queryStringParameters: { action: 'connect' } });
  const body = response.body;

  assert.equal(response.statusCode, 200);
  assert.match(body, /authorizationUrl/);
  const authorizationUrl = new URL(JSON.parse(body).authorizationUrl);
  assert.match(authorizationUrl.searchParams.get('scope'), /webmasters\.readonly/);
  assert.match(authorizationUrl.searchParams.get('scope'), /analytics\.readonly/);
  assert.doesNotMatch(body, /super-secret-client-secret|super-secret-state-key|code_verifier|GSC_TOKEN_ENCRYPTION_KEY/);
});

test('OAuth connection start prunes stale state inside its serializable reservation transaction', async () => {
  const transactionQueries = [];
  const handler = createHandler({
    verifyAdminToken: async () => true,
    getSql: () => {
      const sql = async (strings) => {
        const query = strings.join(' ');
        transactionQueries.push(query);
        if (query.includes('INSERT INTO gsc_oauth_states')) return [];
        return [];
      };
      sql.transaction = async (queries) => Promise.all(typeof queries === 'function' ? queries(sql) : queries);
      return sql;
    },
    env: configuredEnv,
    now: () => new Date('2026-08-24T04:00:00.000Z'),
  });

  const response = await handler({ httpMethod: 'GET', headers: { authorization: 'Bearer admin' }, queryStringParameters: { action: 'connect' } });

  assert.equal(response.statusCode, 429);
  const reservationQuery = transactionQueries.join('\n');
  assert.match(reservationQuery, /pg_advisory_xact_lock\(943176\)/);
  assert.match(reservationQuery, /DELETE FROM gsc_oauth_states/);
  assert.match(reservationQuery, /INSERT INTO gsc_oauth_states/);
  assert.ok(reservationQuery.indexOf('DELETE FROM gsc_oauth_states') < reservationQuery.indexOf('INSERT INTO gsc_oauth_states'));
});
