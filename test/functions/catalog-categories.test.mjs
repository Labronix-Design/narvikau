import assert from 'node:assert/strict';
import test from 'node:test';

import { createCatalogCategoriesHandler } from '../../netlify/functions/catalog-categories.js';

test('GET categories returns the safe cached active category snapshot', async () => {
  const sql = async () => [{ payload: [
    { id: 1, slug: 'canopy', name: 'Canopies', description: null, sort_order: 0 },
    { id: 2, slug: '../bad', name: 'Bad', description: null, sort_order: 1 },
  ] }];
  const response = await createCatalogCategoriesHandler({ getSql: () => sql })({ httpMethod: 'GET' });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), [{ id: 1, slug: 'canopy', name: 'Canopies', description: null, sort_order: 0 }]);
  assert.equal(response.headers['Netlify-Cache-Tag'], 'catalogue:categories');
});

test('categories rejects mutation methods and sends uncached errors', async () => {
  const handler = createCatalogCategoriesHandler({ getSql: () => async () => { throw new Error('database offline'); } });
  const method = await handler({ httpMethod: 'POST' });
  const failure = await handler({ httpMethod: 'GET' });

  assert.equal(method.statusCode, 405);
  assert.equal(failure.statusCode, 503);
  assert.equal(method.headers['Cache-Control'], 'no-store');
  assert.equal(failure.headers['Cache-Control'], 'no-store');
  assert.doesNotMatch(failure.body, /database offline/);
});
