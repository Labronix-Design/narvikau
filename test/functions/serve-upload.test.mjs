import assert from 'node:assert/strict';
import test from 'node:test';
import { createServeUploadHandler, localUploadFallbackUrl, toNetlifyResponse } from '../../netlify/functions/serve-upload.mjs';

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

test('serialises image bytes as base64 for the Netlify serverless runtime', async () => {
  const response = new Response(Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
    status: 200,
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=60' },
  });

  assert.deepEqual(await toNetlifyResponse(response), {
    statusCode: 200,
    headers: { 'cache-control': 'public, max-age=60', 'content-type': 'image/png' },
    body: 'iVBORw==',
    isBase64Encoded: true,
  });
});
