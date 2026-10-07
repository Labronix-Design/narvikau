import '@angular/compiler';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toProductCardImage } from './products.component';

test('uses a product primary image before gallery images', () => {
  assert.equal(
    toProductCardImage('/images/cover.jpg', ['/images/side.jpg']),
    '/images/cover.jpg',
  );
});

test('uses the first gallery image when a product has no primary cover', () => {
  assert.equal(
    toProductCardImage(null, ['/images/side.jpg', '/images/rear.jpg']),
    '/images/side.jpg',
  );
});
