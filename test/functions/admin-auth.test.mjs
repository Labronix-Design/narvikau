import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminAuthHandler, createAdminTokenVerifier } from '../../netlify/functions/admin-auth.js';

const json = (response) => JSON.parse(response.body);

function authConfig() {
  return {
    adminPassword: 'correct horse battery staple',
    databaseUrl: 'postgres://test',
  };
}

test('login issues an unpredictable bearer token while storing only its hash', async () => {
  const created = [];
  const handler = createAdminAuthHandler({
    getConfig: authConfig,
    makeToken: () => 'secure-random-token-value',
    store: {
      ensure: async () => {}, cleanup: async () => {}, isRateLimited: async () => false,
      recordFailedLogin: async () => {}, clearFailedLogins: async () => {},
      createSession: async (tokenHash) => created.push(tokenHash),
    },
  });
  const response = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ password: 'correct horse battery staple' }) });
  assert.equal(response.statusCode, 200);
  assert.equal(json(response).token, 'secure-random-token-value');
  assert.equal(created.length, 1);
  assert.notEqual(created[0], 'secure-random-token-value');
  assert.equal(created[0].length, 64);
});

test('login records an invalid password and returns a generic rejection', async () => {
  let failedIdentifier = '';
  const handler = createAdminAuthHandler({
    getConfig: authConfig,
    store: {
      ensure: async () => {}, cleanup: async () => {}, isRateLimited: async () => false,
      recordFailedLogin: async (identifier) => { failedIdentifier = identifier; },
      clearFailedLogins: async () => {}, createSession: async () => { throw new Error('must not create a session'); },
    },
  });
  const response = await handler({ httpMethod: 'POST', headers: { 'x-nf-client-connection-ip': '203.0.113.8' }, body: JSON.stringify({ password: 'wrong' }) });
  assert.equal(response.statusCode, 401);
  assert.deepEqual(json(response), { error: 'Invalid credentials' });
  assert.match(failedIdentifier, /^[a-f0-9]{64}$/);
});

test('login refuses further password attempts from a currently blocked source', async () => {
  const handler = createAdminAuthHandler({
    getConfig: authConfig,
    store: {
      ensure: async () => {}, cleanup: async () => {}, isRateLimited: async () => true,
      recordFailedLogin: async () => { throw new Error('must not record'); }, clearFailedLogins: async () => { throw new Error('must not clear'); },
      createSession: async () => { throw new Error('must not create'); },
    },
  });
  const response = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ password: 'correct horse battery staple' }) });
  assert.equal(response.statusCode, 429);
  assert.deepEqual(json(response), { error: 'Too many login attempts. Please try again later.' });
});

test('token verification accepts only a token backed by an unexpired server session', async () => {
  let seenHash = '';
  const verify = createAdminTokenVerifier({
    getConfig: authConfig,
    store: {
      ensure: async () => {},
      hasValidSession: async (tokenHash) => {
        seenHash = tokenHash;
        return tokenHash === '5b19b63e62f7325d1ce0e974d67ff0d52d8607ccbd52e31b813dd97ce716e8d3';
      },
    },
  });
  assert.equal(await verify({ headers: { authorization: 'Bearer server-issued-token' } }), true);
  assert.equal(seenHash, '5b19b63e62f7325d1ce0e974d67ff0d52d8607ccbd52e31b813dd97ce716e8d3');
  assert.equal(await verify({ headers: { authorization: 'Bearer different-token' } }), false);
});

test('authentication and token verification operate without runtime schema setup', async () => {
  const sharedStore = {
    cleanup: async () => {},
    isRateLimited: async () => false,
    recordFailedLogin: async () => { throw new Error('must not reject valid credentials'); },
    clearFailedLogins: async () => {},
    createSession: async () => {},
    hasValidSession: async () => true,
  };
  const handler = createAdminAuthHandler({ getConfig: authConfig, store: sharedStore, makeToken: () => 'issued-token' });
  const verify = createAdminTokenVerifier({ getConfig: authConfig, store: sharedStore });

  const login = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ password: 'correct horse battery staple' }) });
  assert.equal(login.statusCode, 200);
  assert.equal(await verify({ headers: { authorization: 'Bearer issued-token' } }), true);
});

test('does not expose session-store errors during sign-in', async () => {
  const handler = createAdminAuthHandler({
    getConfig: authConfig,
    store: {
      cleanup: async () => { throw new Error('relation admin_sessions does not exist'); },
      isRateLimited: async () => false,
      recordFailedLogin: async () => {},
      clearFailedLogins: async () => {},
      createSession: async () => {},
    },
  });

  const response = await handler({
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ password: 'correct horse battery staple' }),
  });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(json(response), { error: 'Unable to process login' });
});
