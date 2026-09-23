import assert from 'node:assert/strict';
import test from 'node:test';

import { readCatalogueReadModel, rebuildCatalogueReadModels, resolvePurchaseMode } from '../../netlify/functions/_catalogue-cache.js';

test('resolves the database-owned purchase mode with a safe legacy price fallback', () => {
  assert.equal(resolvePurchaseMode({ priceCents: 0, purchaseMode: null }), 'quote_only');
  assert.equal(resolvePurchaseMode({ priceCents: 199900, purchaseMode: null }), 'online_checkout');
  assert.equal(resolvePurchaseMode({ priceCents: 199900, purchaseMode: 'quote_only' }), 'quote_only');
});

test('catalogue snapshots expose a resolved purchaseMode for every product and accessory', async () => {
  const sql = async (strings) => {
    const query = strings.join(' ');
    if (query.includes('FROM catalog_products')) {
      return [
        { id: 1, slug: 'legacy-quote-product', base_price_cents: 0, purchase_mode: null },
        { id: 2, slug: 'priced-quote-product', base_price_cents: 199900, purchase_mode: 'quote_only' },
      ];
    }
    if (query.includes('FROM product_variants')) return [];
    if (query.includes('FROM catalog_accessories')) {
      return [
        { id: 3, slug: 'legacy-priced-accessory', price_cents: 15000, purchase_mode: null },
        { id: 4, slug: 'quote-accessory', price_cents: 0, purchase_mode: 'online_checkout' },
      ];
    }
    return [];
  };

  const payloads = await rebuildCatalogueReadModels(sql, ['products', 'accessories']);

  assert.deepEqual(payloads.products.map((product) => product.purchaseMode), ['quote_only', 'quote_only']);
  assert.deepEqual(payloads.accessories.map((accessory) => accessory.purchaseMode), ['online_checkout', 'quote_only']);
});

test('catalogue snapshots keep the price fallback while the nullable mode migration is not yet applied', async () => {
  const sql = async (strings) => {
    const query = strings.join(' ');
    if (query.includes('purchase_mode')) {
      const error = new Error('column "purchase_mode" does not exist');
      error.code = '42703';
      throw error;
    }
    if (query.includes('FROM catalog_products')) return [{ id: 1, slug: 'legacy-product', base_price_cents: 199900 }];
    if (query.includes('FROM product_variants')) return [];
    if (query.includes('FROM catalog_accessories')) return [{ id: 2, slug: 'legacy-accessory', price_cents: 0 }];
    return [];
  };

  const payloads = await rebuildCatalogueReadModels(sql, ['products', 'accessories']);

  assert.deepEqual(payloads.products.map((product) => product.purchaseMode), ['online_checkout']);
  assert.deepEqual(payloads.accessories.map((accessory) => accessory.purchaseMode), ['quote_only']);
});

test('a legacy cached payload is normalised in memory before a public response', async () => {
  const sql = async () => [{
    payload: [
      { id: 1, slug: 'legacy-product', base_price_cents: 199900 },
      { id: 2, slug: 'legacy-quote-product', base_price_cents: 0 },
    ],
  }];

  const payload = await readCatalogueReadModel(sql, 'products');

  assert.deepEqual(payload.map((product) => product.purchaseMode), ['online_checkout', 'quote_only']);
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
