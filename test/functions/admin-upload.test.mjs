import assert from 'node:assert/strict';
import test from 'node:test';

import { createAdminUploadHandler } from '../../netlify/functions/admin-upload.mjs';

const authorize = async () => true;

function request(body) {
  return new Request('https://navrik.com.au/api/admin-upload', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function rasterBase64(type) {
  const bytes = {
    'image/jpeg': [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0],
    'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    'image/webp': [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
  };
  return Buffer.from(bytes[type]).toString('base64');
}

function createHandler() {
  const saved = [];
  const handler = createAdminUploadHandler({
    verifyToken: authorize,
    getImageStore: () => ({ set: async (...args) => saved.push(args) }),
    createKey: () => 'unique-image-key',
  });
  return { handler, saved };
}

test('rejects SVG image uploads before writing them to storage', async () => {
  const { handler, saved } = createHandler();
  const response = await handler(request({
    filename: 'product.svg',
    contentType: 'image/svg+xml',
    dataBase64: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64'),
  }));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Unsupported image type. Use JPEG, PNG, or WebP.' });
  assert.equal(saved.length, 0);
});

test('rejects a declared image type when its bytes do not match that raster format', async () => {
  const { handler, saved } = createHandler();
  const response = await handler(request({
    filename: 'not-a-png.png',
    contentType: 'image/png',
    dataBase64: rasterBase64('image/jpeg'),
  }));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Image data does not match the selected image type.' });
  assert.equal(saved.length, 0);
});

for (const contentType of ['image/jpeg', 'image/png', 'image/webp']) {
  test(`stores a ${contentType} upload with verified bytes`, async () => {
    const { handler, saved } = createHandler();
    const response = await handler(request({
      filename: `product.${contentType.split('/')[1]}`,
      contentType,
      dataBase64: rasterBase64(contentType),
    }));

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { url: `/uploads/unique-image-key.${contentType === 'image/jpeg' ? 'jpg' : contentType.split('/')[1]}` });
    assert.equal(saved.length, 1);
    assert.equal(saved[0][2].metadata.contentType, contentType);
  });
}

test('does not expose storage failure details to the client', async () => {
  const handler = createAdminUploadHandler({
    verifyToken: authorize,
    getImageStore: () => ({ set: async () => { throw new Error('storage credential problem'); } }),
    createKey: () => 'unique-image-key',
  });

  const response = await handler(request({
    filename: 'product.png', contentType: 'image/png', dataBase64: rasterBase64('image/png'),
  }));

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Unable to upload image' });
});
