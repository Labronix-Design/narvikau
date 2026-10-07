import '@angular/compiler';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toProductGallery } from './product-detail.component';

test('uses the primary image as the cover before unique additional gallery images', () => {
  assert.deepEqual(
    toProductGallery('/images/canopy-cover.jpg', [
      '/images/canopy-side.jpg',
      '/images/canopy-cover.jpg',
      '/images/canopy-rear.jpg',
      '/images/canopy-side.jpg',
    ]),
    [
      '/images/canopy-cover.jpg',
      '/images/canopy-side.jpg',
      '/images/canopy-rear.jpg',
    ],
  );
});

test('uses uploaded gallery images when the primary cover is not set', () => {
  assert.deepEqual(
    toProductGallery(null, ['/images/canopy-side.jpg', '/images/canopy-side.jpg']),
    ['/images/canopy-side.jpg'],
  );
});
