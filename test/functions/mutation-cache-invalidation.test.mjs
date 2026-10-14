import assert from 'node:assert/strict';
import test from 'node:test';

import { purgeMutationCache } from '../../netlify/functions/_mutation-cache-invalidation.js';

test('product and category mutations purge exactly the two catalogue lists and storefront', async () => {
  for (const kind of ['product', 'category']) {
    const purges = [];
    await purgeMutationCache(kind, async (tags) => purges.push(tags));
    assert.deepEqual(purges, [[
      'catalogue:products', 'catalogue:categories', 'catalogue:storefront',
    ]]);
  }
});
