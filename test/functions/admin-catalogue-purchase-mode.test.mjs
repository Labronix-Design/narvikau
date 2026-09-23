import assert from 'node:assert/strict';
import test from 'node:test';

import { createAdminAccessoriesHandler } from '../../netlify/functions/admin-accessories.js';
import { createAdminProductsHandler } from '../../netlify/functions/admin-products.js';

const authenticated = async () => true;
const noRebuild = async () => {};
const noPurge = async () => {};

function productRequest(purchase_mode) {
  return {
    httpMethod: 'POST',
    headers: {},
    queryStringParameters: {},
    body: JSON.stringify({ slug: 'test-product', name: 'Test product', category: 'tray', base_price: 1999, purchase_mode }),
  };
}

function accessoryRequest(purchase_mode) {
  return {
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ slug: 'test-accessory', name: 'Test accessory', category: 'toolbox', price: 1999, purchase_mode }),
  };
}

function productUpdateRequest(purchase_mode) {
  return {
    httpMethod: 'PUT',
    headers: {},
    queryStringParameters: {},
    body: JSON.stringify({ id: 4, slug: 'test-product', name: 'Test product', category: 'tray', base_price: 1999, purchase_mode }),
  };
}

function accessoryUpdateRequest(purchase_mode) {
  return {
    httpMethod: 'PUT',
    headers: {},
    body: JSON.stringify({ id: 4, slug: 'test-accessory', name: 'Test accessory', category: 'toolbox', price: 1999, purchase_mode }),
  };
}

test('admin product and accessory creation reject explicit null purchase modes before a database write', async () => {
  let databaseCalls = 0;
  const getSql = () => async () => { databaseCalls += 1; return []; };
  const productHandler = createAdminProductsHandler({ verifyToken: authenticated, getSql, rebuild: noRebuild, purgeTags: noPurge });
  const accessoryHandler = createAdminAccessoriesHandler({ verifyToken: authenticated, getSql, rebuild: noRebuild, purgeTags: noPurge });

  const [productResponse, accessoryResponse] = await Promise.all([
    productHandler(productRequest(null)),
    accessoryHandler(accessoryRequest(null)),
  ]);

  assert.equal(productResponse.statusCode, 400);
  assert.equal(accessoryResponse.statusCode, 400);
  assert.equal(databaseCalls, 0);
});

test('admin product and accessory updates reject explicit null purchase modes before a database write', async () => {
  let databaseCalls = 0;
  const getSql = () => async () => { databaseCalls += 1; return []; };
  const productHandler = createAdminProductsHandler({ verifyToken: authenticated, getSql, rebuild: noRebuild, purgeTags: noPurge });
  const accessoryHandler = createAdminAccessoriesHandler({ verifyToken: authenticated, getSql, rebuild: noRebuild, purgeTags: noPurge });

  const [productResponse, accessoryResponse] = await Promise.all([
    productHandler(productUpdateRequest(null)),
    accessoryHandler(accessoryUpdateRequest(null)),
  ]);

  assert.equal(productResponse.statusCode, 400);
  assert.equal(accessoryResponse.statusCode, 400);
  assert.equal(databaseCalls, 0);
});

test('new catalogue entries derive and persist a concrete mode when it is omitted', async () => {
  const values = [];
  const sql = async (strings, ...parameters) => {
    values.push(...parameters);
    return [{ id: 9, slug: 'test-product' }];
  };
  const request = productRequest();
  const body = JSON.parse(request.body);
  delete body.purchase_mode;
  request.body = JSON.stringify(body);
  const handler = createAdminProductsHandler({ verifyToken: authenticated, getSql: () => sql, rebuild: noRebuild, purgeTags: noPurge });

  const response = await handler(request);

  assert.equal(response.statusCode, 201);
  assert.ok(values.includes('online_checkout'));
});

test('admin legacy writes retry without purchase_mode only when the resolved mode remains safe', async () => {
  const queries = [];
  const sql = async (strings) => {
    const query = strings.join(' ');
    queries.push(query);
    if (query.includes('purchase_mode')) {
      const error = new Error('column "purchase_mode" does not exist');
      error.code = '42703';
      throw error;
    }
    return [{ id: 9, slug: 'test-product' }];
  };
  const handler = createAdminProductsHandler({ verifyToken: authenticated, getSql: () => sql, rebuild: noRebuild, purgeTags: noPurge });

  const response = await handler(productRequest('online_checkout'));

  assert.equal(response.statusCode, 201);
  assert.equal(queries.length, 2);
  assert.doesNotMatch(queries[1], /purchase_mode/);
});

test('admin positive quote-only creation reports migration pending instead of falling back to a legacy write', async () => {
  let calls = 0;
  const sql = async (strings) => {
    calls += 1;
    const query = strings.join(' ');
    if (query.includes('purchase_mode')) {
      const error = new Error('column "purchase_mode" does not exist');
      error.code = '42703';
      throw error;
    }
    throw new Error('legacy write must not run');
  };
  const handler = createAdminAccessoriesHandler({ verifyToken: authenticated, getSql: () => sql, rebuild: noRebuild, purgeTags: noPurge });

  const response = await handler(accessoryRequest('quote_only'));

  assert.equal(response.statusCode, 503);
  assert.equal(calls, 1);
});
