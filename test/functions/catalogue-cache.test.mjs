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
};

test('catalogue rebuild creates only the canopy product snapshot', async () => {
  const queries = [];
  const sql = async (strings) => {
    const query = strings.join(' ');
    queries.push(query);
    if (query.includes('FROM catalog_products')) return [adventure];
    return [];
  };

  const payloads = await rebuildCatalogueReadModels(sql);

  assert.deepEqual(payloads, { products: [adventure] });
  assert.equal(queries.length, 2);
  assert.match(queries[0], /category = 'canopy'/);
  assert.doesNotMatch(queries.join('\n'), /purchase_mode|price_cents|catalog_accessories|compatibility_matrix|catalog_categories/i);
});

test('catalogue rebuild rejects retired or unknown snapshot sections', async () => {
  const sql = async () => assert.fail('invalid sections must be rejected before a query');

  await assert.rejects(() => rebuildCatalogueReadModels(sql, ['accessories']), /Unknown catalogue cache section/);
  await assert.rejects(() => readCatalogueReadModel(sql, 'categories'), /Unknown catalogue cache section/);
});

test('a cached public product payload is allowlisted and limited to canopies', async () => {
  const sql = async () => [{
    payload: [
      { ...adventure, base_price_cents: 199900, purchaseMode: 'online_checkout' },
      { ...adventure, id: 2, slug: 'navrik-standard-tray', category: 'tray' },
      { ...adventure, id: 3, slug: 'navrik-canopy-expedition', name: 'Navrik Canopy — Expedition' },
    ],
  }];

  const payload = await readCatalogueReadModel(sql, 'products');

  assert.deepEqual(payload, [adventure]);
  assert.doesNotMatch(JSON.stringify(payload), /purchase|price|tray|accessory/i);
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
