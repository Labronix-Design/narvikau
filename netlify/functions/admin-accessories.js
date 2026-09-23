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

function zarToCents(value) {
  const amount = Number(value);
  const cents = Math.round(amount * 100);
  return Number.isFinite(amount) && Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

export function createAdminAccessoriesHandler({
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

  try {
    if (event.httpMethod === 'GET') {
      const rows = await sql`
        SELECT * FROM catalog_accessories ORDER BY sort_order ASC, created_at DESC
      `;
      return { statusCode: 200, headers, body: JSON.stringify(rows) };
    }

    const body = JSON.parse(event.body || '{}');

    if (event.httpMethod === 'POST') {
      const { slug, name, category, price, description, image_url, is_active, sort_order, purchase_mode } = body;
      if (!slug || !name || !category) return { statusCode: 400, headers, body: JSON.stringify({ error: 'slug, name, category required' }) };

      const priceNum = price == null || price === '' ? 0 : Number(price);
      if (!Number.isFinite(priceNum) || priceNum < 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'price must be a valid non-negative number' }) };
      }
      const priceCents = zarToCents(priceNum);
      const purchaseMode = createdPurchaseMode(body, priceCents);
      if (!purchaseMode) return { statusCode: 400, headers, body: JSON.stringify({ error: 'purchase_mode must be online_checkout or quote_only' }) };

      const [row] = await writeWithPurchaseModeFallback({
        purchaseMode,
        priceCents,
        writeWithMode: () => sql`
        INSERT INTO catalog_accessories (slug, name, category, price_cents, description, image_url, is_active, sort_order, purchase_mode)
        VALUES (${slug}, ${name}, ${category}, ${priceCents}, ${description || null}, ${image_url || null}, ${is_active !== false}, ${sort_order || 0}, ${purchaseMode})
        RETURNING *
      `,
        writeLegacy: () => sql`
        INSERT INTO catalog_accessories (slug, name, category, price_cents, description, image_url, is_active, sort_order)
        VALUES (${slug}, ${name}, ${category}, ${priceCents}, ${description || null}, ${image_url || null}, ${is_active !== false}, ${sort_order || 0})
        RETURNING *
      `,
      });
      if (!row) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Accessory not found' }) };
      await rebuild(sql, ['accessories', 'categories', 'compatibility']);
      await purgeMutationCache('accessory', purgeTags, context);
      return { statusCode: 201, headers, body: JSON.stringify(row) };
    }

    if (event.httpMethod === 'PUT') {
      const { id, slug, name, category, price, description, image_url, is_active, sort_order, purchase_mode } = body;
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
      const purchaseModeProvided = Object.hasOwn(body, 'purchase_mode');
      if (purchaseModeProvided && !isPurchaseMode(purchase_mode)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'purchase_mode must be online_checkout or quote_only' }) };

      // Reject rather than silently zero — Number('') and Number(null) are both
      // 0 in JS, so an empty/missing price must be checked explicitly before the
      // numeric conversion, not caught by isFinite alone.
      if (price === '' || price === null || price === undefined) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'price is required' }) };
      }
      const priceNum = Number(price);
      if (!Number.isFinite(priceNum) || priceNum < 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'price must be a valid non-negative number' }) };
      }
      const priceCents = zarToCents(priceNum);

      const [row] = await writeWithPurchaseModeFallback({
        purchaseMode: purchaseModeProvided ? purchase_mode : null,
        priceCents,
        writeWithMode: () => sql`
        UPDATE catalog_accessories SET
          slug        = ${slug},
          name        = ${name},
          category    = ${category},
          price_cents = ${priceCents},
          description = ${description || null},
          image_url   = ${image_url || null},
          is_active   = ${is_active !== false},
          sort_order  = ${sort_order || 0},
          purchase_mode = CASE WHEN ${purchaseModeProvided} THEN ${purchase_mode} ELSE purchase_mode END,
          updated_at  = NOW()
        WHERE id = ${id}
        RETURNING *
      `,
        writeLegacy: () => sql`
        UPDATE catalog_accessories SET
          slug        = ${slug},
          name        = ${name},
          category    = ${category},
          price_cents = ${priceCents},
          description = ${description || null},
          image_url   = ${image_url || null},
          is_active   = ${is_active !== false},
          sort_order  = ${sort_order || 0},
          updated_at  = NOW()
        WHERE id = ${id}
        RETURNING *
      `,
      });
      if (!row) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Accessory not found' }) };
      await rebuild(sql, ['accessories', 'categories', 'compatibility']);
      await purgeMutationCache('accessory', purgeTags, context);
      return { statusCode: 200, headers, body: JSON.stringify(row) };
    }

    if (event.httpMethod === 'DELETE') {
      const { id } = body;
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
      const [deleted] = await sql`DELETE FROM catalog_accessories WHERE id = ${id} RETURNING id`;
      if (!deleted) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Accessory not found' }) };
      await rebuild(sql, ['accessories', 'categories', 'compatibility']);
      await purgeMutationCache('accessory', purgeTags, context);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    if (err?.code === 'PURCHASE_MODE_MIGRATION_REQUIRED') {
      return { statusCode: 503, headers, body: JSON.stringify({ error: 'Catalogue purchase settings are temporarily unavailable' }) };
    }
    console.error('admin-accessories error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Unable to manage accessories' }) };
  }
  };
}

export const handler = createAdminAccessoriesHandler();
