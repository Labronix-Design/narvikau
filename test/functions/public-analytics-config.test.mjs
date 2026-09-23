import assert from 'node:assert/strict';
import test from 'node:test';

import { createHandler } from '../../netlify/functions/public-analytics-config.js';

test('public analytics config exposes only a valid GA measurement ID with edge caching', async () => {
  const handler = createHandler({ env: { GA4_MEASUREMENT_ID: 'G-AB12CD34EF' } });

  const response = await handler({ httpMethod: 'GET', queryStringParameters: null });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { enabled: true, measurementId: 'G-AB12CD34EF' });
  assert.equal(response.headers['Cache-Control'], 'public, max-age=300, s-maxage=86400, stale-while-revalidate=2592000');
  assert.equal(response.headers['Netlify-CDN-Cache-Control'], 'public, s-maxage=604800, stale-while-revalidate=2592000');
  assert.equal(response.headers['Netlify-Cache-Tag'], 'analytics-config');
  assert.equal(response.headers['X-Content-Type-Options'], 'nosniff');
});

test('public analytics config stays disabled when the measurement ID is absent or malformed', async () => {
  for (const env of [{}, { GA4_MEASUREMENT_ID: 'not-a-google-id' }]) {
    const handler = createHandler({ env });
    const response = await handler({ httpMethod: 'GET', queryStringParameters: null });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), { enabled: false, measurementId: null });
  }
});

test('public analytics config rejects unsupported methods and query cache variants', async () => {
  const handler = createHandler({ env: { GA4_MEASUREMENT_ID: 'G-AB12CD34EF' } });

  const post = await handler({ httpMethod: 'POST', queryStringParameters: null });
  const query = await handler({ httpMethod: 'GET', queryStringParameters: { refresh: '1' } });

  assert.equal(post.statusCode, 405);
  assert.deepEqual(JSON.parse(post.body), { error: 'Method not allowed' });
  assert.equal(query.statusCode, 400);
  assert.deepEqual(JSON.parse(query.body), { error: 'Query parameters are not supported' });
});
