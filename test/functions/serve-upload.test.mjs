import assert from 'node:assert/strict';
import test from 'node:test';
import { localUploadFallbackUrl } from '../../netlify/functions/serve-upload.mjs';

test('uses the public upload only for a local development request', () => {
  assert.equal(
    localUploadFallbackUrl('http://localhost:4200/uploads/example.png', 'example.png'),
    'https://navrik.com.au/uploads/example.png',
  );
  assert.equal(localUploadFallbackUrl('https://navrik.com.au/uploads/example.png', 'example.png'), null);
});
