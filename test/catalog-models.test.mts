import assert from 'node:assert/strict';
import test from 'node:test';
import { toRenderableCategories, toRenderableSpecifications, type CatalogProduct } from '../src/website/_models/catalog.models.ts';

test('accepts safe catalogue categories and discards malformed entries', () => {
  assert.deepEqual(toRenderableCategories([
    { id: 1, slug: 'canopy', name: 'Canopies', description: null, sort_order: 0 },
    { id: 2, slug: '../unsafe', name: 'Unsafe', description: null, sort_order: 1 },
    { id: 3, slug: 'inactive', name: '', description: null, sort_order: 2 },
  ]), [{ id: 1, slug: 'canopy', name: 'Canopies', description: null, sort_order: 0 }]);
  assert.deepEqual(toRenderableCategories(null), []);
});

test('accepts a 120-character category slug and rejects an overlong public slug', () => {
  const slug = `historic-${'a'.repeat(111)}`;
  const overlong = `historic-${'a'.repeat(112)}`;
  const categories = toRenderableCategories([
    { id: 12, slug, name: 'Historic', description: null, sort_order: 0 },
    { id: 13, slug: overlong, name: 'Unmigrated', description: null, sort_order: 1 },
  ]);

  assert.equal(slug.length, 120);
  assert.equal(overlong.length, 121);
  assert.equal(categories.length, 1);
  assert.equal(categories[0].slug, slug);
});

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
