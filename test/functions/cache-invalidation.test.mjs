import assert from 'node:assert/strict';
import test from 'node:test';

import * as cacheInvalidation from '../../netlify/functions/_cache-invalidation.js';

const { purgePublicCacheTags } = cacheInvalidation;

test('official purge options omit the token property when Lambda context has no purge token', () => {
  assert.equal(typeof cacheInvalidation.officialPurgeOptions, 'function');
  const options = cacheInvalidation.officialPurgeOptions(
    ['site-settings', 'site-settings'],
    { clientContext: { custom: {} } },
  );

  assert.deepEqual(options, { tags: ['site-settings'] });
  assert.equal(Object.hasOwn(options, 'token'), false);
});

test('cache invalidation purges only the exact requested public cache tags', async () => {
  const calls = [];
  const purge = async (options) => { calls.push(options); };
  const context = { clientContext: { custom: { purge_api_token: 'lambda-secret' } } };

  await purgePublicCacheTags(['catalogue:products', 'site-settings', 'catalogue:products'], purge, context);

  assert.deepEqual(calls, [{ tags: ['catalogue:products', 'site-settings'] }]);
});

test('cache invalidation rejects empty, wildcard, and unknown tags before purge', async () => {
  const purge = async () => assert.fail('invalid cache tags must not reach the purge helper');

  await assert.rejects(() => purgePublicCacheTags([], purge), /Unknown public cache tag/);
  await assert.rejects(() => purgePublicCacheTags(['*'], purge), /Unknown public cache tag/);
  await assert.rejects(() => purgePublicCacheTags(['catalogue:*'], purge), /Unknown public cache tag/);
  await assert.rejects(() => purgePublicCacheTags(['site-settings', 'unknown'], purge), /Unknown public cache tag/);
});
