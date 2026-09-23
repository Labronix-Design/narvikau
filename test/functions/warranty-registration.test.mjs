import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAdminWarrantyHandler,
  createWarrantyRegistrationHandler,
  validateWarrantyRegistration,
} from '../../netlify/functions/warranty-registration.js';

const validRegistration = {
  purchaserName: 'Avery Customer',
  purchaserEmail: 'avery@example.test',
  purchaserPhone: '+61 412 345 678',
  productId: 3,
  productName: 'Navrik Canopy Adventure',
  purchaseReference: 'AU-INV-1042',
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
    purchaserName: 'Avery Customer',
    purchaserEmail: 'avery@example.test',
    purchaserPhone: '+61 412 345 678',
    productId: 3,
    productName: 'Navrik Canopy Adventure',
    purchaseReference: 'AU-INV-1042',
    vehicleMake: 'Toyota',
    vehicleModel: 'Hilux',
    vehicleYear: 2024,
    vehicleRegistration: 'ABC 123 GP',
    purchaseDate: '2026-08-15',
    fitmentDate: '2026-08-20',
    consent: true,
  });
});

test('rejects unknown fields, invalid identity, dates and missing warranty consent', () => {
  assert.throws(() => validateWarrantyRegistration({ ...validRegistration, extra: 'not accepted' }));
  assert.throws(() => validateWarrantyRegistration({ ...validRegistration, purchaserEmail: 'not-an-email' }));
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

test('creates a standalone registration and replays the same submission idempotently', async () => {
  const queries = [];
  const sql = async (strings, ...values) => {
    queries.push({ query: strings.join('?'), values });
    if (strings.join('?').includes('INSERT INTO warranty_registrations')) return [{ registration_reference: 'WTY-AU-1042', created: true }];
    return [];
  };
  const handler = createWarrantyRegistrationHandler({ getSql: () => sql, rateLimiter: { check: async () => true } });

  const response = await handler({
    httpMethod: 'POST',
    headers: { 'x-nf-client-connection-ip': '198.51.100.24' },
    body: JSON.stringify(validRegistration),
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(JSON.parse(response.body), { ok: true, registrationReference: 'WTY-AU-1042', replayed: false });
  assert.equal(queries.some(({ values }) => values.includes('Avery Customer')), true);
  assert.equal(queries.some(({ values }) => values.includes('Navrik Canopy Adventure')), true);
  assert.equal(queries.some(({ query }) => /\b(?:CREATE|ALTER)\b/i.test(query)), false);
});

test('returns the existing warranty reference for a duplicate standalone submission', async () => {
  const sql = async (strings) => strings.join('').includes('INSERT INTO warranty_registrations')
    ? [{ registration_reference: 'WTY-AU-1042', created: false }]
    : [];
  const handler = createWarrantyRegistrationHandler({ getSql: () => sql, rateLimiter: { check: async () => true } });
  const response = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify(validRegistration) });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { ok: true, registrationReference: 'WTY-AU-1042', replayed: true });
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
  assert.doesNotMatch(queries[0].query, /order_id|order_reference/);
});
