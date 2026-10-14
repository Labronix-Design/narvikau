import assert from 'node:assert/strict';
import test from 'node:test';

import { normaliseCatalogueCategories, readCatalogueReadModel, rebuildCatalogueReadModels } from '../../netlify/functions/_catalogue-cache.js';

const canopies = { id: 1, slug: 'canopy', name: 'Canopies', description: null, sort_order: 0 };
const retired = { id: 2, slug: 'retired', name: 'Retired', description: null, sort_order: 1 };
const boundedCategory = `historic-${'a'.repeat(111)}`;
const overlongCategory = `historic-${'a'.repeat(112)}`;

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
  assert.match(queries[0], /catalog_products\.is_active = TRUE/);
  assert.doesNotMatch(queries[0], /category = 'canopy'|CANOPY_SLUGS/);
  assert.match(queries[0], /specifications/);
  assert.doesNotMatch(queries.join('\n'), /purchase_mode|price_cents|catalog_accessories|compatibility_matrix/i);
});

test('catalogue rebuild rejects retired or unknown snapshot sections', async () => {
  const sql = async () => assert.fail('invalid sections must be rejected before a query');

  await assert.rejects(() => rebuildCatalogueReadModels(sql, ['accessories']), /Unknown catalogue cache section/);
  await assert.rejects(() => readCatalogueReadModel(sql, 'accessories'), /Unknown catalogue cache section/);
});

test('catalogue rebuild publishes active categories and only products in active categories', async () => {
  const queries = [];
  const inactiveProduct = { ...adventure, id: 3, slug: 'navrik-canopy-archived', is_active: false };
  const retiredCategoryProduct = { ...accessory, category: 'retired' };
  const sourceProducts = [adventure, inactiveProduct, retiredCategoryProduct];
  const sourceCategories = [
    { ...canopies, is_active: true },
    { ...retired, is_active: false },
  ];
  const sql = async (strings) => {
    const query = strings.join(' ');
    queries.push(query);
    if (query.includes('FROM catalog_categories')) return sourceCategories.filter(category => category.is_active);
    if (query.includes('FROM catalog_products')) {
      const activeProductPredicate = /WHERE catalog_products\.is_active = TRUE/.test(query);
      const activeCategoryPredicate = /JOIN catalog_categories[\s\S]*?AND catalog_categories\.is_active = TRUE/.test(query);
      return sourceProducts.filter(product =>
        (!activeProductPredicate || product.is_active !== false)
        && (!activeCategoryPredicate || sourceCategories.some(category => category.slug === product.category && category.is_active)));
    }
    return [];
  };

  const payloads = await rebuildCatalogueReadModels(sql, ['products', 'categories']);

  assert.deepEqual(payloads, { products: [adventure], categories: [canopies] });
  const productQuery = queries.find(query => query.includes('FROM catalog_products'));
  assert.match(productQuery, /JOIN catalog_categories/);
  assert.match(productQuery, /is_active = TRUE/g);
  assert.match(queries.find(query => query.includes('FROM catalog_categories')), /is_active = TRUE/);
  const withoutCategoryActivePredicate = productQuery.replace('AND catalog_categories.is_active = TRUE', '');
  assert.deepEqual((await sql([withoutCategoryActivePredicate])).map(product => product.slug), [
    'navrik-canopy-adventure', 'navrik-recovery-kit',
  ]);
  const withoutProductActivePredicate = productQuery.replace('WHERE catalog_products.is_active = TRUE', 'WHERE TRUE');
  assert.deepEqual((await sql([withoutProductActivePredicate])).map(product => product.slug), [
    'navrik-canopy-adventure', 'navrik-canopy-archived',
  ]);
  assert.deepEqual(await readCatalogueReadModel(async () => [{ payload: [canopies] }], 'categories'), [canopies]);
});

test('cache normalisers accept 120-character category slugs and reject longer public values', async () => {
  const categories = normaliseCatalogueCategories([
    { ...canopies, id: 12, slug: boundedCategory, name: 'Historic' },
    { ...canopies, id: 13, slug: overlongCategory, name: 'Unmigrated' },
  ]);
  const products = await readCatalogueReadModel(async () => [{
    payload: [
      { ...accessory, category: boundedCategory },
      { ...accessory, id: 10, category: overlongCategory },
    ],
  }], 'products');

  assert.equal(boundedCategory.length, 120);
  assert.equal(overlongCategory.length, 121);
  assert.equal(categories.length, 1);
  assert.equal(categories[0].slug, boundedCategory);
  assert.equal(products.length, 1);
  assert.equal(products[0].category, boundedCategory);
});

test('category payloads reject malformed entries and never expose inactive metadata', () => {
  assert.deepEqual(normaliseCatalogueCategories([canopies, { ...retired, is_active: false }]), [canopies]);
  assert.deepEqual(normaliseCatalogueCategories(null), []);
  assert.deepEqual(normaliseCatalogueCategories([
    { ...canopies, slug: '../canopy' },
    { ...canopies, id: -1 },
    { ...canopies, sort_order: '' },
    { ...canopies, is_active: 'false' },
  ]), []);
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

test('cached payload normalisation rejects whitespace-normalised prototype-shaped specification labels', async () => {
  const sql = async () => [{
    payload: [' __proto__ ', ' constructor ', ' prototype '].map((label, index) => ({
      ...accessory,
      id: index + 20,
      specifications: { [label]: 'unsafe' },
    })),
  }];

  const payload = await readCatalogueReadModel(sql, 'products');

  assert.deepEqual(payload, []);
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
