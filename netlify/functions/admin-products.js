import { neon } from '@neondatabase/serverless';
import { verifyAdminToken } from './admin-auth.js';
import { rebuildCatalogueReadModels } from './_catalogue-cache.js';
import { purgeMutationCache } from './_mutation-cache-invalidation.js';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json',
};

const PURCHASE_MODES = new Set(['online_checkout', 'quote_only']);

function isPurchaseMode(value) {
  return PURCHASE_MODES.has(value);
}

function isMissingPurchaseModeColumn(error) {
  return error?.code === '42703' && /purchase_mode/.test(error?.message || '');
}

function migrationPendingError() {
  const error = new Error('Catalogue purchase mode migration is required');
  error.code = 'PURCHASE_MODE_MIGRATION_REQUIRED';
  return error;
}

async function writeWithPurchaseModeFallback({ writeWithMode, writeLegacy, purchaseMode, priceCents }) {
  try {
    return await writeWithMode();
  } catch (error) {
    if (!isMissingPurchaseModeColumn(error)) throw error;
    if (purchaseMode === 'quote_only' && priceCents > 0) throw migrationPendingError();
    return writeLegacy();
  }
}

function createdPurchaseMode(body, priceCents) {
  if (!Object.hasOwn(body, 'purchase_mode')) return priceCents > 0 ? 'online_checkout' : 'quote_only';
  return isPurchaseMode(body.purchase_mode) ? body.purchase_mode : null;
}

function zarToCents(value, { allowNegative = false } = {}) {
  const amount = Number(value);
  const cents = Math.round(amount * 100);
  return Number.isFinite(amount) && Number.isSafeInteger(cents) && (allowNegative || cents >= 0) ? cents : null;
}

export function createAdminProductsHandler({
  verifyToken = verifyAdminToken,
  getSql = () => neon(process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL),
  rebuild = rebuildCatalogueReadModels,
  purgeTags,
} = {}) {
  return async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const authed = await verifyToken(event);
  if (!authed) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };

  const sql = getSql();

  const params = event.queryStringParameters || {};

  try {
    if (event.httpMethod === 'GET') {
      if (params.variants === '1' && params.product_id) {
        const productId = parseInt(params.product_id, 10);
        const variants = await sql`
          SELECT * FROM product_variants
          WHERE product_id = ${productId}
          ORDER BY variant_type ASC, sort_order ASC
        `;
        return { statusCode: 200, headers, body: JSON.stringify(variants) };
      }

      const products = await sql`
        SELECT * FROM catalog_products ORDER BY sort_order ASC, created_at DESC
      `;
      return { statusCode: 200, headers, body: JSON.stringify(products) };
    }

    const body = JSON.parse(event.body || '{}');

    if (event.httpMethod === 'POST') {
      const {
        slug, name, category, tray_type, size, color, base_price, coating_cost, description, image_url, is_active, sort_order,
        gallery_urls, material, thickness, front_door_window, side_door, rear_door, vehicle_fit, purchase_mode,
      } = body;
      if (!slug || !name || !category) return { statusCode: 400, headers, body: JSON.stringify({ error: 'slug, name, category required' }) };

      // base_price of 0 is valid (canopies are "quote only"), but a garbage
      // non-numeric value must be rejected rather than silently coerced.
      const basePriceNum = base_price == null || base_price === '' ? 0 : Number(base_price);
      if (!Number.isFinite(basePriceNum) || basePriceNum < 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'base_price must be a valid non-negative number' }) };
      }
      const coatingCostNum = coating_cost == null || coating_cost === '' ? 0 : Number(coating_cost);
      if (!Number.isFinite(coatingCostNum) || coatingCostNum < 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'coating_cost must be a valid non-negative number' }) };
      }
      const basePriceCents = zarToCents(basePriceNum);
      const coatingCostCents = zarToCents(coatingCostNum);
      const purchaseMode = createdPurchaseMode(body, basePriceCents);
      if (!purchaseMode) return { statusCode: 400, headers, body: JSON.stringify({ error: 'purchase_mode must be online_checkout or quote_only' }) };

      const [row] = await writeWithPurchaseModeFallback({
        purchaseMode,
        priceCents: basePriceCents,
        writeWithMode: () => sql`
        INSERT INTO catalog_products (
          slug, name, category, tray_type, size, color, base_price_cents, coating_cost_cents, description, image_url, is_active, sort_order,
          gallery_urls, material, thickness, front_door_window, side_door, rear_door, vehicle_fit, purchase_mode
        )
        VALUES (
          ${slug}, ${name}, ${category}, ${tray_type || null}, ${size || null}, ${color || 'silver'}, ${basePriceCents}, ${coatingCostCents}, ${description || null}, ${image_url || null}, ${is_active !== false}, ${sort_order || 0},
          ${gallery_urls || []}, ${material || null}, ${thickness || null}, ${front_door_window || null}, ${side_door || null}, ${rear_door || null}, ${vehicle_fit || null}, ${purchaseMode}
        )
        RETURNING *
      `,
        writeLegacy: () => sql`
        INSERT INTO catalog_products (
          slug, name, category, tray_type, size, color, base_price_cents, coating_cost_cents, description, image_url, is_active, sort_order,
          gallery_urls, material, thickness, front_door_window, side_door, rear_door, vehicle_fit
        )
        VALUES (
          ${slug}, ${name}, ${category}, ${tray_type || null}, ${size || null}, ${color || 'silver'}, ${basePriceCents}, ${coatingCostCents}, ${description || null}, ${image_url || null}, ${is_active !== false}, ${sort_order || 0},
          ${gallery_urls || []}, ${material || null}, ${thickness || null}, ${front_door_window || null}, ${side_door || null}, ${rear_door || null}, ${vehicle_fit || null}
        )
        RETURNING *
      `,
      });
      await rebuild(sql, ['products', 'categories']);
      await purgeMutationCache('product', purgeTags, context);
      return { statusCode: 201, headers, body: JSON.stringify(row) };
    }

    if (event.httpMethod === 'PUT') {
      // Variant upsert
      if (body.variant === true) {
        const { id, product_id, variant_type, variant_value, label, price_delta, is_active, sort_order } = body;
        const priceDeltaCents = zarToCents(price_delta ?? 0, { allowNegative: true });
        if (priceDeltaCents === null) return { statusCode: 400, headers, body: JSON.stringify({ error: 'price_delta must be a valid amount' }) };
        if (id) {
          // Update existing variant
          const [row] = await sql`
            UPDATE product_variants SET
              variant_type  = ${variant_type},
              variant_value = ${variant_value},
              label         = ${label},
              price_delta_cents = ${priceDeltaCents},
              is_active     = ${is_active !== false},
              sort_order    = ${sort_order ?? 0}
            WHERE id = ${id}
            RETURNING *
          `;
          if (!row) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Variant not found' }) };
          await rebuild(sql, ['products', 'categories']);
          await purgeMutationCache('product', purgeTags, context);
          return { statusCode: 200, headers, body: JSON.stringify(row) };
        } else {
          // Insert new variant
          if (!product_id || !variant_type || !variant_value || !label) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'product_id, variant_type, variant_value, label required' }) };
          }
          const [row] = await sql`
            INSERT INTO product_variants (product_id, variant_type, variant_value, label, price_delta_cents, is_active, sort_order)
            VALUES (${product_id}, ${variant_type}, ${variant_value}, ${label}, ${priceDeltaCents}, ${is_active !== false}, ${sort_order ?? 0})
            RETURNING *
          `;
          await rebuild(sql, ['products', 'categories']);
          await purgeMutationCache('product', purgeTags, context);
          return { statusCode: 200, headers, body: JSON.stringify(row) };
        }
      }

      // Product update
      const {
        id, slug, name, category, tray_type, size, color, base_price, coating_cost, description, image_url, is_active, sort_order,
        gallery_urls, material, thickness, front_door_window, side_door, rear_door, vehicle_fit, purchase_mode,
      } = body;
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
      const purchaseModeProvided = Object.hasOwn(body, 'purchase_mode');
      if (purchaseModeProvided && !isPurchaseMode(purchase_mode)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'purchase_mode must be online_checkout or quote_only' }) };

      // Reject rather than silently zero — an empty/missing base_price (e.g. from
      // a cleared input) must never be coerced into overwriting a real price.
      // Number('') === 0 and Number(null) === 0 in JS, so both must be checked
      // explicitly before the numeric conversion, not caught by isFinite alone.
      if (base_price === '' || base_price === null || base_price === undefined) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'base_price is required' }) };
      }
      const basePriceNum = Number(base_price);
      if (!Number.isFinite(basePriceNum) || basePriceNum < 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'base_price must be a valid non-negative number' }) };
      }
      const coatingCostProvided = coating_cost !== '' && coating_cost !== null && coating_cost !== undefined;
      const coatingCostNum = coatingCostProvided ? Number(coating_cost) : 0;
      if (coatingCostProvided && (!Number.isFinite(coatingCostNum) || coatingCostNum < 0)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'coating_cost must be a valid non-negative number' }) };
      }
      const basePriceCents = zarToCents(basePriceNum);
      const coatingCostCents = zarToCents(coatingCostNum);

      const [row] = await writeWithPurchaseModeFallback({
        purchaseMode: purchaseModeProvided ? purchase_mode : null,
        priceCents: basePriceCents,
        writeWithMode: () => sql`
        UPDATE catalog_products SET
          slug              = ${slug},
          name              = ${name},
          category          = ${category},
          tray_type         = ${tray_type || null},
          size              = ${size || null},
          color             = ${color || 'silver'},
          base_price_cents  = ${basePriceCents},
          coating_cost_cents = ${coatingCostCents},
          description       = ${description || null},
          image_url         = ${image_url || null},
          is_active         = ${is_active !== false},
          sort_order        = ${sort_order || 0},
          gallery_urls      = ${gallery_urls || []},
          material          = ${material || null},
          thickness         = ${thickness || null},
          front_door_window = ${front_door_window || null},
          side_door         = ${side_door || null},
          rear_door         = ${rear_door || null},
          vehicle_fit       = ${vehicle_fit || null},
          purchase_mode     = CASE WHEN ${purchaseModeProvided} THEN ${purchase_mode} ELSE purchase_mode END,
          updated_at        = NOW()
        WHERE id = ${id}
        RETURNING *
      `,
        writeLegacy: () => sql`
        UPDATE catalog_products SET
          slug              = ${slug},
          name              = ${name},
          category          = ${category},
          tray_type         = ${tray_type || null},
          size              = ${size || null},
          color             = ${color || 'silver'},
          base_price_cents  = ${basePriceCents},
          coating_cost_cents = ${coatingCostCents},
          description       = ${description || null},
          image_url         = ${image_url || null},
          is_active         = ${is_active !== false},
          sort_order        = ${sort_order || 0},
          gallery_urls      = ${gallery_urls || []},
          material          = ${material || null},
          thickness         = ${thickness || null},
          front_door_window = ${front_door_window || null},
          side_door         = ${side_door || null},
          rear_door         = ${rear_door || null},
          vehicle_fit       = ${vehicle_fit || null},
          updated_at        = NOW()
        WHERE id = ${id}
        RETURNING *
      `,
      });
      if (!row) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Product not found' }) };
      await rebuild(sql, ['products', 'categories']);
      await purgeMutationCache('product', purgeTags, context);
      return { statusCode: 200, headers, body: JSON.stringify(row) };
    }

    if (event.httpMethod === 'DELETE') {
      // Variant delete
      if (body.variant === true) {
        const { id } = body;
        if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'variant id required' }) };
        const [deleted] = await sql`DELETE FROM product_variants WHERE id = ${id} RETURNING id`;
        if (!deleted) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Variant not found' }) };
        await rebuild(sql, ['products', 'categories']);
        await purgeMutationCache('product', purgeTags, context);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }

      // Product delete
      const { id } = body;
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
      const [deleted] = await sql`DELETE FROM catalog_products WHERE id = ${id} RETURNING id`;
      if (!deleted) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Product not found' }) };
      await rebuild(sql, ['products', 'categories']);
      await purgeMutationCache('product', purgeTags, context);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    if (err?.code === 'CACHE_REFRESH_PENDING') {
      return { statusCode: 503, headers, body: JSON.stringify({ error: 'Your catalogue change was saved, but the storefront refresh is pending. Please retry shortly.' }) };
    }
    if (err?.code === 'PURCHASE_MODE_MIGRATION_REQUIRED') {
      return { statusCode: 503, headers, body: JSON.stringify({ error: 'Catalogue purchase settings are temporarily unavailable' }) };
    }
    console.error('admin-products error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Unable to manage products' }) };
  }
  };
}

export const handler = createAdminProductsHandler();
