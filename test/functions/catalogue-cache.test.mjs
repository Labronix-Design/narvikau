import assert from 'node:assert/strict';
import test from 'node:test';

import { readCatalogueReadModel, rebuildCatalogueReadModels } from '../../netlify/functions/_catalogue-cache.js';

const adventure = {
  id: 1,
  slug: 'navrik-canopy-adventure',
  name: 'Navrik Canopy — Adventure',
  category: 'canopy',
  size: 'Adventure',
  color: 'black',
  description: null,
  image_url: null,
  sort_order: 1,
  gallery_urls: [],
  material: null,
  thickness: null,
  front_door_window: null,
  side_door: null,
  rear_door: null,
  vehicle_fit: null,
  specifications: { Material: '5052-grade aluminium' },
};

const accessory = {
  id: 9,
  slug: 'navrik-recovery-kit',
  name: 'Navrik Recovery Kit',
  category: 'accessory',
  size: null,
  color: null,
  description: 'A compact vehicle recovery kit.',
  image_url: '/uploads/recovery-kit.jpg',
  sort_order: 9,
  gallery_urls: ['/uploads/recovery-kit.jpg'],
  material: null,
  thickness: null,
  front_door_window: null,
  side_door: null,
  rear_door: null,
  vehicle_fit: null,
  specifications: { Material: 'Nylon', Capacity: '10,000 kg' },
};

test('catalogue rebuild creates a generic active product snapshot including an accessory', async () => {
  const queries = [];
  const sql = async (strings) => {
    const query = strings.join(' ');
    queries.push(query);
    if (query.includes('FROM catalog_products')) return [adventure, accessory];
    return [];
  };

  const payloads = await rebuildCatalogueReadModels(sql);

  assert.deepEqual(payloads, { products: [adventure, accessory] });
  assert.equal(queries.length, 2);
  assert.match(queries[0], /WHERE is_active = TRUE/);
  assert.doesNotMatch(queries[0], /category = 'canopy'|CANOPY_SLUGS/);
  assert.match(queries[0], /specifications/);
  assert.doesNotMatch(queries.join('\n'), /purchase_mode|price_cents|catalog_accessories|compatibility_matrix|catalog_categories/i);
});

test('catalogue rebuild rejects retired or unknown snapshot sections', async () => {
  const sql = async () => assert.fail('invalid sections must be rejected before a query');

  await assert.rejects(() => rebuildCatalogueReadModels(sql, ['accessories']), /Unknown catalogue cache section/);
  await assert.rejects(() => readCatalogueReadModel(sql, 'categories'), /Unknown catalogue cache section/);
});

test('a cached public product payload allowlists a valid accessory and strips non-public payment fields', async () => {
  const sql = async () => [{
    payload: [
      { ...adventure, base_price_cents: 199900, purchaseMode: 'retired_purchase_mode' },
      { ...accessory, price_cents: 199900, checkout_url: 'https://payments.example/checkout', yoco_payment_id: 'payment' },
      { ...accessory, id: 10, specifications: { Material: { nested: 'value' } } },
    ],
  }];

  const payload = await readCatalogueReadModel(sql, 'products');

  assert.deepEqual(payload, [adventure, accessory]);
  assert.doesNotMatch(JSON.stringify(payload), /purchase|price|checkout|yoco/i);
});

test('catalogue rebuild retains the four seeded canopy records alongside a safe generic product', async () => {
  const canopies = ['adventure', 'overland', 'sports', 'defender'].map((model, index) => ({
    ...adventure,
    id: index + 1,
    slug: `navrik-canopy-${model}`,
    name: `Navrik Canopy — ${model}`,
    sort_order: index + 1,
  }));
  const sql = async (strings) => strings.join(' ').includes('FROM catalog_products')
    ? [...canopies, accessory]
    : [];

  const payloads = await rebuildCatalogueReadModels(sql);

  assert.deepEqual(payloads.products.map(({ slug }) => slug), [
    'navrik-canopy-adventure', 'navrik-canopy-overland', 'navrik-canopy-sports',
    'navrik-canopy-defender', 'navrik-recovery-kit',
  ]);
});

test('a public catalogue read returns an empty setup state without rebuilding or writing a missing cache', async () => {
  const queries = [];
  const sql = async (strings) => {
    queries.push(strings.join(' '));
    return [];
  };

  const payload = await readCatalogueReadModel(sql, 'products');

  assert.deepEqual(payload, []);
  assert.equal(queries.length, 1);
  assert.match(queries[0], /SELECT payload FROM catalogue_read_models/);
});
