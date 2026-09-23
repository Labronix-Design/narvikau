import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { invalidateBusinessCacheAfterCheckout, purgePromoStatusAfterCheckout, releaseCheckoutReservations, releaseStaleCouponReservations, reservePromoSlot, resolveCatalogCheckout, resolveCheckoutSelection, resolvePaymentIntent } from '../../netlify/functions/create-checkout.js';

test('checkout rejects quote-only and non-positive selections with a distinguishable code', async () => {
  await assert.rejects(
    () => resolveCheckoutSelection({ purchaseMode: 'quote_only', priceCents: 0 }),
    (error) => error.code === 'QUOTE_ONLY_ITEM',
  );
  await assert.rejects(
    () => resolveCheckoutSelection({ purchaseMode: 'online_checkout', priceCents: 0 }),
    (error) => error.code === 'QUOTE_ONLY_ITEM',
  );
});

test('checkout rejects a database quote-only product before pricing its options', async () => {
  const sql = async (strings) => {
    const query = strings.join(' ');
    if (query.includes('FROM catalog_products')) {
      return [{ id: 7, slug: 'quoted-product', name: 'Quoted product', tray_type: 'standard', base_price_cents: 3095000, purchase_mode: 'quote_only' }];
    }
    throw new Error(`Unexpected checkout query: ${query}`);
  };

  await assert.rejects(
    () => resolveCatalogCheckout(sql, [{ slug: 'quoted-product' }]),
    (error) => error.code === 'QUOTE_ONLY_ITEM',
  );
});

test('checkout rejects a positive-priced quote-only standalone accessory', async () => {
  const sql = async (strings) => {
    const query = strings.join(' ');
    if (query.includes('FROM catalog_accessories')) {
      return [{ id: 3, slug: 'quoted-accessory', name: 'Quoted accessory', price_cents: 180000, purchase_mode: 'quote_only' }];
    }
    throw new Error(`Unexpected checkout query: ${query}`);
  };

  await assert.rejects(
    () => resolveCatalogCheckout(sql, [{ slug: 'accessory:quoted-accessory' }]),
    (error) => error.code === 'QUOTE_ONLY_ITEM',
  );
});

test('checkout rejects retired Combo and package cart entries before any database query', async () => {
  let queries = 0;
  const sql = async () => { queries += 1; return []; };

  for (const slug of ['combo:retired-offer', 'package:retired-offer']) {
    await assert.rejects(
      () => resolveCatalogCheckout(sql, [{ slug }]),
      { message: 'This product configuration is no longer available. Please select an item from the current catalogue.' },
    );
  }
  assert.equal(queries, 0);
});

test('checkout rejects a positive-priced quote-only selected accessory', async () => {
  const sql = async (strings) => {
    const query = strings.join(' ');
    if (query.includes('FROM catalog_products')) {
      return [{ id: 7, slug: 'online-product', name: 'Online product', tray_type: 'standard', base_price_cents: 3095000, purchase_mode: 'online_checkout' }];
    }
    if (query.includes('FROM product_variants')) return [];
    if (query.includes('FROM catalog_accessories')) {
      return [{ id: 3, slug: 'quoted-accessory', name: 'Quoted accessory', price_cents: 180000, purchase_mode: 'quote_only' }];
    }
    throw new Error(`Unexpected checkout query: ${query}`);
  };

  await assert.rejects(
    () => resolveCatalogCheckout(sql, [{ slug: 'online-product', accessories: ['quoted-accessory'] }]),
    (error) => error.code === 'QUOTE_ONLY_ITEM',
  );
});

test('checkout retains the positive-price fallback while purchase_mode migration is not yet applied', async () => {
  const sql = async (strings) => {
    const query = strings.join(' ');
    if (query.includes('purchase_mode')) {
      const error = new Error('column "purchase_mode" does not exist');
      error.code = '42703';
      throw error;
    }
    if (query.includes('FROM catalog_products')) {
      return [{ id: 7, slug: 'legacy-product', name: 'Legacy product', tray_type: 'standard', base_price_cents: 3095000 }];
    }
    if (query.includes('FROM product_variants')) return [];
    if (query.includes('FROM catalog_accessories')) return [];
    return [];
  };

  const result = await resolveCatalogCheckout(sql, [{ slug: 'legacy-product' }]);

  assert.equal(result.subtotalCents, 3095000);
});

test('ignores the historic director voucher and always uses the server-calculated amount', () => {
  const intent = resolvePaymentIntent({
    voucherCode: 'NavLbx@26',
    payFullAmount: false,
    chargeAmountCents: 659000,
  });

  assert.deepEqual(intent, {
    amountCents: 659000,
    isFullPayment: false,
  });
});

test('checkout does not write or calculate with legacy decimal order money columns', async () => {
  const source = await readFile(new URL('../../netlify/functions/create-checkout.js', import.meta.url), 'utf8');
  for (const legacyColumn of [
    'base_price', 'coating_cost', 'discount_amount', 'installation_cost',
    'amount_excl_vat', 'vat_amount', 'total_incl_vat', 'order_total',
    'balance_due', 'coupon_discount_amount',
  ]) {
    assert.doesNotMatch(source, new RegExp(`\\b${legacyColumn}\\b`));
  }
});

test('a persisted checkout invalidates only the affected overview, sales and order snapshots', async () => {
  const invalidated = [];
  await invalidateBusinessCacheAfterCheckout(async () => [], async (_sql, sections) => { invalidated.push(sections); });

  assert.deepEqual(invalidated, [['business_overview', 'sales_performance', 'orders']]);
});

test('a successful checkout purges promo status and no unrelated public cache tags', async () => {
  const purgeCalls = [];
  const context = { clientContext: { custom: { purge_api_token: 'lambda-secret' } } };

  await purgePromoStatusAfterCheckout(async (...args) => { purgeCalls.push(args); }, context);

  assert.deepEqual(purgeCalls, [[['promo-status']]]);
});

test('the default checkout purge path passes the Lambda purge token to the official Netlify helper', async () => {
  const previousFetch = globalThis.fetch;
  const previousSiteId = process.env.SITE_ID;
  const previousPurgeToken = process.env.NETLIFY_PURGE_API_TOKEN;
  const previousLocal = process.env.NETLIFY_LOCAL;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true };
  };
  process.env.SITE_ID = 'site-test';
  delete process.env.NETLIFY_PURGE_API_TOKEN;
  delete process.env.NETLIFY_LOCAL;

  try {
    const context = { clientContext: { custom: { purge_api_token: 'lambda-secret' } } };

    await purgePromoStatusAfterCheckout(undefined, context);

    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.headers.Authorization, 'Bearer lambda-secret');
    assert.deepEqual(JSON.parse(requests[0].options.body), {
      cache_tags: ['promo-status'],
      site_id: 'site-test',
    });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousSiteId === undefined) delete process.env.SITE_ID;
    else process.env.SITE_ID = previousSiteId;
    if (previousPurgeToken === undefined) delete process.env.NETLIFY_PURGE_API_TOKEN;
    else process.env.NETLIFY_PURGE_API_TOKEN = previousPurgeToken;
    if (previousLocal === undefined) delete process.env.NETLIFY_LOCAL;
    else process.env.NETLIFY_LOCAL = previousLocal;
  }
});

test('checkout success does not depend on the promo status edge purge', async () => {
  await assert.doesNotReject(
    purgePromoStatusAfterCheckout(async () => { throw new Error('edge unavailable'); }),
  );
});

test('checkout derives product, active variants and accessories solely from database cents', async () => {
  const sql = async (strings) => {
    const query = strings.join(' ');
    if (query.includes('FROM catalog_products')) return [{ id: 7, slug: 'admin-product', name: 'Admin product', base_price_cents: 3095000 }];
    if (query.includes('FROM product_variants')) return [{ id: 11, variant_type: 'colour', variant_value: 'black', label: 'Black', price_delta_cents: 275000 }];
    if (query.includes('FROM catalog_accessories')) return [{ id: 3, slug: 'admin-accessory', name: 'Admin accessory', price_cents: 180000 }];
    return [];
  };

  const result = await resolveCatalogCheckout(sql, [{
    slug: 'admin-product',
    variants: [{ variant_type: 'colour', variant_value: 'black', price_delta_cents: 1 }],
    accessories: [{ slug: 'admin-accessory', price_cents: 1 }],
  }]);

  assert.deepEqual(result, {
    items: [{ productId: 7, slug: 'admin-product', name: 'Admin product', basePriceCents: 3095000, variantCents: 275000, accessoryCents: 180000, totalCents: 3550000 }],
    subtotalCents: 3550000,
  });
});

test('checkout rejects a repeated variant instead of letting a browser multiply its price', async () => {
  const sql = async (strings) => {
    const query = strings.join(' ');
    if (query.includes('FROM catalog_products')) return [{ id: 7, slug: 'admin-product', name: 'Admin product', tray_type: 'standard', base_price_cents: 3095000 }];
    if (query.includes('FROM product_variants')) return [{ id: 11, variant_type: 'colour', variant_value: 'black', label: 'Black', price_delta_cents: 275000 }];
    if (query.includes('FROM catalog_accessories')) return [];
    return [];
  };

  await assert.rejects(
    resolveCatalogCheckout(sql, [{
      slug: 'admin-product',
      variants: [
        { variant_type: 'colour', variant_value: 'black' },
        { variant_type: 'colour', variant_value: 'black' },
      ],
    }]),
    { message: 'Selected option is not available' },
  );
});

test('checkout rejects a repeated accessory instead of letting a browser multiply its price', async () => {
  const sql = async (strings) => {
    const query = strings.join(' ');
    if (query.includes('FROM catalog_products')) return [{ id: 7, slug: 'admin-product', name: 'Admin product', tray_type: 'standard', base_price_cents: 3095000 }];
    if (query.includes('FROM product_variants')) return [];
    if (query.includes('FROM catalog_accessories')) return [{ id: 3, slug: 'admin-accessory', name: 'Admin accessory', price_cents: 180000 }];
    if (query.includes('FROM compatibility_matrix')) return [];
    return [];
  };

  await assert.rejects(
    resolveCatalogCheckout(sql, [{
      slug: 'admin-product',
      accessories: ['admin-accessory', 'admin-accessory'],
    }]),
    { message: 'Selected accessory is not available' },
  );
});

test('checkout rejects an inactive or removed database product instead of accepting a browser price', async () => {
  const sql = async () => [];
  await assert.rejects(
    resolveCatalogCheckout(sql, [{ slug: 'removed-product', price: 1 }]),
    { message: 'Selected product is not available' },
  );
});

test('checkout resolves a namespaced standalone accessory from the active database price', async () => {
  const sql = async (strings) => {
    const query = strings.join(' ');
    if (query.includes('FROM catalog_accessories')) return [{ id: 3, slug: 'admin-accessory', name: 'Admin accessory', price_cents: 180000 }];
    return [];
  };

  const result = await resolveCatalogCheckout(sql, [{ slug: 'accessory:admin-accessory', price: 1 }]);

  assert.deepEqual(result, {
    items: [{ productId: null, slug: 'accessory:admin-accessory', name: 'Admin accessory', basePriceCents: 180000, variantCents: 0, accessoryCents: 0, totalCents: 180000 }],
    subtotalCents: 180000,
  });
});

test('a downstream checkout failure releases its reserved coupon usage and promo capacity', async () => {
  const queries = [];
  const sql = async (strings) => {
    queries.push(strings.join(' '));
    return [];
  };

  await releaseCheckoutReservations(sql, { couponReservationId: 9, promoSlotId: 12 });

  assert.equal(queries.length, 2);
  assert.match(queries[0], /coupon_usage_reservations/);
  assert.match(queries[0], /current_uses = GREATEST/);
  assert.match(queries[1], /released_at = NOW/);
});

test('a promo slot is claimed only against capacity that has not aged out', async () => {
  let query = '';
  const sql = async (strings, ...values) => {
    query = strings.join(' ');
    assert.deepEqual(values, ['buyer@example.com', 'Buyer', 25]);
    return [{ slot_number: 12 }];
  };

  assert.equal(
    await reservePromoSlot(sql, { customerEmail: 'buyer@example.com', customerName: 'Buyer', maxSlots: 25 }),
    12,
  );
  // Capacity is counted at read time, so an abandoned checkout stops blocking a
  // new customer without a periodic cleanup task.
  assert.match(query, /stale_checkout_promo_slots/);
  assert.match(query, /pg_advisory_xact_lock/);
});

test('a full promo returns no slot rather than overselling', async () => {
  const sql = async () => [];
  assert.equal(
    await reservePromoSlot(sql, { customerEmail: 'buyer@example.com', customerName: 'Buyer', maxSlots: 0 }),
    null,
  );
});

test('an aged-out coupon hold is released and its counter corrected before the coupon is claimed', async () => {
  let query = '';
  const sql = async (strings, ...values) => {
    query = strings.join(' ');
    assert.deepEqual(values, [41, 41]);
    return [{ released_count: 2 }];
  };

  assert.deepEqual(await releaseStaleCouponReservations(sql, 41), { releasedCount: 2 });
  assert.match(query, /stale_coupon_usage_reservations/);
  assert.match(query, /state = 'released'/);
  // The counter must come back down, or a released hold would still consume a use.
  assert.match(query, /current_uses = GREATEST/);
});

test('correcting coupon capacity tolerates a coupon with nothing to release', async () => {
  const sql = async () => [];
  assert.deepEqual(await releaseStaleCouponReservations(sql, 41), { releasedCount: 0 });
});
