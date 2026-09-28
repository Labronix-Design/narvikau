import assert from 'node:assert/strict';
import test from 'node:test';
import { toRenderableSpecifications, type CatalogProduct } from '../src/website/_models/catalog.models.js';

test('keeps only renderable string specifications for an accessory product', () => {
  const accessory: CatalogProduct = {
    id: 7,
    slug: 'navrik-roof-rack',
    name: 'Navrik Roof Rack',
    category: 'accessory',
    description: 'A load-carrying roof rack.',
    image_url: null,
    sort_order: 2,
    gallery_urls: [],
    specifications: toRenderableSpecifications({
      width: '1,400 mm',
      finish: 'Powder-coated aluminium',
      load_rating: 120,
      includes_hardware: true,
      dimensions: { width: '1,400 mm' },
      images: ['rack.jpg'],
    }),
  };

  assert.deepEqual(accessory.specifications, {
    width: '1,400 mm',
    finish: 'Powder-coated aluminium',
  });
});

test('returns no renderable specifications for non-object server values', () => {
  assert.deepEqual(toRenderableSpecifications(null), {});
  assert.deepEqual(toRenderableSpecifications(['not', 'a', 'specification', 'object']), {});
});
