import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAdminWarrantyHandler,
  createWarrantyRegistrationHandler,
  validateWarrantyRegistration,
} from '../../netlify/functions/warranty-registration.js';

const validRegistration = {
  token: 'A3OdzYqA96uQYVY8vD04XPf88VNz0-bmJVrhkAjm0A4',
  vehicleMake: 'Toyota',
  vehicleModel: 'Hilux',
  vehicleYear: 2024,
  vehicleRegistration: 'ABC 123 GP',
  purchaseDate: '2026-08-15',
  fitmentDate: '2026-08-20',
  consent: true,
};

test('validates and normalises a warranty registration before persistence', () => {
  assert.deepEqual(validateWarrantyRegistration(validRegistration), {
    token: 'A3OdzYqA96uQYVY8vD04XPf88VNz0-bmJVrhkAjm0A4',
    vehicleMake: 'Toyota',
    vehicleModel: 'Hilux',
    vehicleYear: 2024,
    vehicleRegistration: 'ABC 123 GP',
    purchaseDate: '2026-08-15',
    fitmentDate: '2026-08-20',
    consent: true,
  });
});

test('rejects identity claims, invalid dates and missing warranty consent', () => {
  assert.throws(() => validateWarrantyRegistration({ ...validRegistration, extra: 'not accepted' }));
  assert.throws(() => validateWarrantyRegistration({ ...validRegistration, purchaserName: 'Avery Customer' }));
  assert.throws(() => validateWarrantyRegistration({ ...validRegistration, token: 'guessable' }));
  assert.throws(() => validateWarrantyRegistration({ ...validRegistration, purchaseDate: '15/08/2026' }));
  assert.throws(() => validateWarrantyRegistration({ ...validRegistration, fitmentDate: '2026-08-14' }));
  assert.throws(() => validateWarrantyRegistration({ ...validRegistration, consent: false }));
});

test('does not persist a malformed warranty registration', async () => {
  let databaseAccessed = false;
  const handler = createWarrantyRegistrationHandler({
    getSql: () => { databaseAccessed = true; throw new Error('must not access database'); },
    rateLimiter: { check: async () => true },
  });

  const response = await handler({
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ ...validRegistration, consent: false }),
  });

  assert.equal(response.statusCode, 400);
  assert.equal(databaseAccessed, false);
});

test('returns 429 without persistence after the warranty rate limit is exhausted', async () => {
  let databaseAccessed = false;
  const handler = createWarrantyRegistrationHandler({
    getSql: () => { databaseAccessed = true; throw new Error('must not persist'); },
    rateLimiter: { check: async () => false },
  });

  const response = await handler({
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify(validRegistration),
  });

  assert.equal(response.statusCode, 429);
  assert.equal(databaseAccessed, false);
});

test('atomically claims a valid single-use token and derives purchaser and product data on the server', async () => {
  const queries = [];
  const sql = async (strings, ...values) => {
    queries.push({ query: strings.join('?'), values });
    if (strings.join('?').includes('UPDATE warranty_registration_tokens')) return [{ registration_reference: 'wty_test_reference' }];
    return [];
  };
  const handler = createWarrantyRegistrationHandler({ getSql: () => sql, rateLimiter: { check: async () => true } });

  const response = await handler({
    httpMethod: 'POST',
    headers: { 'x-nf-client-connection-ip': '198.51.100.24' },
    body: JSON.stringify(validRegistration),
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(JSON.parse(response.body), { ok: true, registrationReference: 'wty_test_reference' });
  assert.equal(queries.some(({ query }) => /UPDATE warranty_registration_tokens/.test(query)), true);
  assert.equal(queries.some(({ query }) => /JOIN orders o/.test(query)), true);
  assert.equal(queries.some(({ values }) => values.includes('Avery Customer') || values.includes('Navrik Aluminium Canopy')), false);
  assert.equal(queries.some(({ query }) => /CREATE|ALTER/i.test(query)), false);
});

test('rejects an invalid or already-used token without exposing order information', async () => {
  const sql = async () => [];
  const handler = createWarrantyRegistrationHandler({ getSql: () => sql, rateLimiter: { check: async () => true } });
  const response = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify(validRegistration) });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(response.body), { error: 'This registration link is not valid or has already been used.' });
});

test('admin warranty records require a valid admin session before querying data', async () => {
  let databaseAccessed = false;
  const handler = createAdminWarrantyHandler({
    verifyAdminToken: async () => false,
    getSql: () => { databaseAccessed = true; throw new Error('must not access database'); },
  });

  const response = await handler({ httpMethod: 'GET', headers: {} });

  assert.equal(response.statusCode, 401);
  assert.equal(databaseAccessed, false);
});

test('admin warranty records return a bounded, newest-first list', async () => {
  const queries = [];
  const sql = async (strings, ...values) => {
    queries.push({ query: strings.join('?'), values });
    return [{ id: 7, registration_reference: 'wty_test_reference', purchaser_name: 'Avery Customer' }];
  };
  const handler = createAdminWarrantyHandler({ verifyAdminToken: async () => true, getSql: () => sql });
  const response = await handler({ httpMethod: 'GET', headers: {}, queryStringParameters: { limit: '500', offset: '0' } });

  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).items.length, 1);
  assert.match(queries[0].query, /ORDER BY registered_at DESC/);
  assert.equal(queries[0].values.includes(100), true);
});
