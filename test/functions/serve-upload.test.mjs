import assert from 'node:assert/strict';
import test from 'node:test';
import defaultHandler, { createServeUploadHandler, localUploadFallbackUrl } from '../../netlify/functions/serve-upload.mjs';

test('uses the public upload only for a local development request', () => {
  assert.equal(
    localUploadFallbackUrl('http://localhost:4200/uploads/example.png', 'example.png'),
    'https://navrik.com.au/uploads/example.png',
  );
  assert.equal(localUploadFallbackUrl('https://navrik.com.au/uploads/example.png', 'example.png'), null);
});

test('does not serve an existing SVG upload as same-origin content', async () => {
  const handler = createServeUploadHandler({
    getImageStore: () => ({
      getWithMetadata: async () => ({
        data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
        metadata: { contentType: 'image/svg+xml' },
      }),
    }),
  });

  const response = await handler(new Request('https://navrik.com.au/uploads/legacy.svg'));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Not found' });
});

test('does not expose blob-storage failure details to the client', async () => {
  const handler = createServeUploadHandler({
    getImageStore: () => ({ getWithMetadata: async () => { throw new Error('private blob error'); } }),
  });

  const response = await handler(new Request('https://navrik.com.au/uploads/example.png'));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Unable to load image' });
});

test('exports a web-request handler so Netlify uses its Response-aware runtime', () => {
  assert.equal(typeof defaultHandler, 'function');
});
