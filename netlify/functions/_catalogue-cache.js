import { taggedPublicReadHeaders, uncachedResponseHeaders } from './_public-cache.js';

const SECTIONS = new Set(['products', 'accessories', 'compatibility', 'categories']);

export function resolvePurchaseMode({ priceCents, purchaseMode }) {
  if (purchaseMode === 'quote_only') return 'quote_only';
  if (purchaseMode === 'online_checkout' && Number(priceCents) > 0) return 'online_checkout';
  return Number(priceCents) > 0 ? 'online_checkout' : 'quote_only';
}

function isMissingPurchaseModeColumn(error) {
  return error?.code === '42703' && /purchase_mode/.test(error?.message || '');
}

async function readWithPurchaseModeFallback(readWithMode, readLegacy) {
  try {
    return await readWithMode();
  } catch (error) {
    if (!isMissingPurchaseModeColumn(error)) throw error;
    return readLegacy();
  }
}

function normaliseCachedCataloguePayload(section, payload) {
  if (!Array.isArray(payload)) return payload;
  if (section !== 'products' && section !== 'accessories') return payload;
  const priceField = section === 'products' ? 'base_price_cents' : 'price_cents';
  return payload.map(({ purchase_mode: purchaseMode, ...item }) => ({
    ...item,
    purchaseMode: resolvePurchaseMode({
      priceCents: item[priceField],
      purchaseMode: item.purchaseMode ?? purchaseMode,
    }),
  }));
}

function assertSections(sections) {
  const requested = [...new Set(sections)];
  if (!requested.every((section) => SECTIONS.has(section))) throw new Error('Unknown catalogue cache section');
  return requested;
}

async function buildProducts(sql) {
  const products = await readWithPurchaseModeFallback(
    () => sql`
      SELECT id, slug, name, category, tray_type, size, color, base_price_cents,
        coating_cost_cents, description, image_url, sort_order, gallery_urls,
        material, thickness, front_door_window, side_door, rear_door, vehicle_fit,
        purchase_mode
      FROM catalog_products
      WHERE is_active = TRUE
      ORDER BY sort_order ASC, category ASC, name ASC
    `,
    () => sql`
      SELECT id, slug, name, category, tray_type, size, color, base_price_cents,
        coating_cost_cents, description, image_url, sort_order, gallery_urls,
        material, thickness, front_door_window, side_door, rear_door, vehicle_fit
      FROM catalog_products
      WHERE is_active = TRUE
      ORDER BY sort_order ASC, category ASC, name ASC
    `,
  );
  const variants = await sql`
    SELECT id, product_id, variant_type, variant_value, label, price_delta_cents, sort_order
    FROM product_variants
    WHERE is_active = TRUE
    ORDER BY variant_type ASC, sort_order ASC, id ASC
  `;
  const byProduct = new Map();
  for (const variant of variants) {
    const current = byProduct.get(variant.product_id) || [];
    current.push(variant);
    byProduct.set(variant.product_id, current);
  }
  return products.map(({ purchase_mode: purchaseMode, ...product }) => ({
    ...product,
    purchaseMode: resolvePurchaseMode({ priceCents: product.base_price_cents, purchaseMode }),
    variants: byProduct.get(product.id) || [],
  }));
}

async function buildAccessories(sql) {
  const accessories = await readWithPurchaseModeFallback(
    () => sql`
      SELECT id, slug, name, category, price_cents, description, image_url, sort_order,
        purchase_mode
      FROM catalog_accessories
      WHERE is_active = TRUE
      ORDER BY sort_order ASC, category ASC, name ASC
    `,
    () => sql`
      SELECT id, slug, name, category, price_cents, description, image_url, sort_order
      FROM catalog_accessories
      WHERE is_active = TRUE
      ORDER BY sort_order ASC, category ASC, name ASC
    `,
  );
  return accessories.map(({ purchase_mode: purchaseMode, ...accessory }) => ({
    ...accessory,
    purchaseMode: resolvePurchaseMode({ priceCents: accessory.price_cents, purchaseMode }),
  }));
}

async function buildCompatibility(sql) {
  return sql`
    SELECT cm.id, cm.accessory_id, cm.tray_type, cm.product_id, cm.vehicle_make,
      cm.vehicle_model, cm.notes, ca.name AS accessory_name, ca.category AS accessory_category,
      ca.price_cents AS accessory_price_cents, ca.description AS accessory_description,
      ca.image_url AS accessory_image_url
    FROM compatibility_matrix cm
    JOIN catalog_accessories ca ON ca.id = cm.accessory_id AND ca.is_active = TRUE
    ORDER BY cm.tray_type NULLS FIRST, ca.category ASC, ca.name ASC
  `;
}

async function buildCategories(sql) {
  return sql`
    SELECT id, slug, name, type, eyebrow, icon, description, sort_order
    FROM catalog_categories
    WHERE is_active = TRUE
    ORDER BY type ASC, sort_order ASC, name ASC
  `;
}

const BUILDERS = {
  products: buildProducts,
  accessories: buildAccessories,
  compatibility: buildCompatibility,
  categories: buildCategories,
};

export async function rebuildCatalogueReadModels(sql, sections = [...SECTIONS]) {
  const requested = assertSections(sections);
  const payloads = {};
  for (const section of requested) {
    payloads[section] = await BUILDERS[section](sql);
    await sql`
      INSERT INTO catalogue_read_models (section, payload, updated_at)
      VALUES (${section}, ${JSON.stringify(payloads[section])}::jsonb, NOW())
      ON CONFLICT (section) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
    `;
  }
  return payloads;
}

export async function readCatalogueReadModel(sql, section) {
  assertSections([section]);
  const [cached] = await sql`
    SELECT payload FROM catalogue_read_models WHERE section = ${section}
  `;
  if (cached?.payload) return normaliseCachedCataloguePayload(section, cached.payload);
  // Public reads never populate cache: only authenticated admin mutations own
  // cache rebuilds, so a browser cannot cause database writes or seed-like work.
  return [];
}

// The catalogue read models only change when an authenticated admin mutation
// rebuilds them, so these responses are safe to hold at the edge. A public read
// therefore costs a database wake-up at most once per cache window instead of
// once per request. Admin screens read through the uncached `admin-*` endpoints,
// so an editor still sees their own change immediately; the storefront picks it
// up within the CDN's one-week fresh window (or immediately after a targeted
// cache-tag purge).
export function catalogueCacheHeaders(section) {
  return {
    'Content-Type': 'application/json',
    ...taggedPublicReadHeaders({
      tags: [`catalogue:${section}`],
      browserSeconds: 300,
      cdnSeconds: 604800,
      staleSeconds: 2592000,
    }),
  };
}

export const catalogueUncachedHeaders = {
  'Content-Type': 'application/json',
  ...uncachedResponseHeaders,
};
