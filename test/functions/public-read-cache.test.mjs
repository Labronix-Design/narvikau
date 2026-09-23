import assert from 'node:assert/strict';
import test from 'node:test';
import { publicReadCacheHeaders, taggedPublicReadHeaders, uncachedResponseHeaders } from '../../netlify/functions/_public-cache.js';
import { catalogueCacheHeaders, catalogueUncachedHeaders } from '../../netlify/functions/_catalogue-cache.js';

// Unreachable host: the driver is constructed successfully but every query
// fails immediately, which is exactly the fail-closed branch under test.
process.env.NETLIFY_DATABASE_URL = 'postgres://unused:unused@127.0.0.1/unused';
delete process.env.NETLIFY_DB_URL;

test('public read responses are held in the durable CDN cache, not only the browser', () => {
  const headers = publicReadCacheHeaders({ browserSeconds: 30, cdnSeconds: 300, staleSeconds: 86400 });
  assert.equal(headers['Cache-Control'], 'public, max-age=30, stale-while-revalidate=86400');
  assert.equal(headers['Netlify-CDN-Cache-Control'], 'public, durable, s-maxage=300, stale-while-revalidate=86400');
});

test('settings and catalogue responses carry exact durable tags and long TTLs', () => {
  const settings = taggedPublicReadHeaders({
    tags: ['site-settings'],
    browserSeconds: 300,
    cdnSeconds: 604800,
    staleSeconds: 2592000,
  });
  const catalogue = taggedPublicReadHeaders({
    tags: ['catalogue:products'],
    browserSeconds: 300,
    cdnSeconds: 604800,
    staleSeconds: 2592000,
  });

  assert.equal(settings['Netlify-Cache-Tag'], 'site-settings');
  assert.equal(catalogue['Netlify-Cache-Tag'], 'catalogue:products');
  assert.equal(settings['Netlify-CDN-Cache-Control'], 'public, durable, s-maxage=604800, stale-while-revalidate=2592000');
});

test('public cache headers reject missing, wildcard, and unknown tags', () => {
  const options = { browserSeconds: 300, cdnSeconds: 604800, staleSeconds: 2592000 };

  assert.throws(() => taggedPublicReadHeaders({ ...options, tags: [] }), /Unknown public cache tag/);
  assert.throws(() => taggedPublicReadHeaders({ ...options, tags: ['*'] }), /Unknown public cache tag/);
  assert.throws(() => taggedPublicReadHeaders({ ...options, tags: ['site-settings', 'all-content'] }), /Unknown public cache tag/);
});

test('catalogue reads are edge-cached so a public request does not wake the database', () => {
  const headers = catalogueCacheHeaders('products');
  assert.match(headers['Netlify-CDN-Cache-Control'], /durable/);
  assert.match(headers['Netlify-CDN-Cache-Control'], /s-maxage=604800/);
  assert.equal(headers['Netlify-Cache-Tag'], 'catalogue:products');
  assert.equal(catalogueUncachedHeaders['Cache-Control'], 'no-store');
  assert.equal(catalogueUncachedHeaders['Netlify-CDN-Cache-Control'], 'no-store');
});

test('a rejected method is never stored at the edge in place of the catalogue', async () => {
  const { handler } = await import('../../netlify/functions/catalog-products.js');
  const response = await handler({ httpMethod: 'POST' });
  assert.equal(response.statusCode, 405);
  assert.equal(response.headers['Netlify-CDN-Cache-Control'], 'no-store');
});

// A cached failure would replay one bad moment to every visitor for the whole
// cache window. Content endpoints communicate that their information is
// unavailable instead of fabricating a default page.
const FAIL_CLOSED_ENDPOINTS = [
  { name: 'site-settings', event: { httpMethod: 'GET' }, expectedStatus: 503 },
  { name: 'legal-pages', event: { httpMethod: 'GET', queryStringParameters: { page: 'refund' } }, expectedStatus: 503 },
];

for (const endpoint of FAIL_CLOSED_ENDPOINTS) {
  test(`${endpoint.name} serves its uncached failure contract`, async () => {
    const { handler } = await import(`../../netlify/functions/${endpoint.name}.js`);
    const response = await handler(endpoint.event);
    assert.equal(response.statusCode, endpoint.expectedStatus);
    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.equal(response.headers['Netlify-CDN-Cache-Control'], 'no-store');
  });
}

test('uncached responses opt out of both the browser and the edge cache', () => {
  assert.deepEqual(uncachedResponseHeaders, {
    'Cache-Control': 'no-store',
    'Netlify-CDN-Cache-Control': 'no-store',
  });
});
