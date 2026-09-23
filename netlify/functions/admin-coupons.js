import { neon } from '@neondatabase/serverless';
import { verifyAdminToken } from './admin-auth.js';
import { purgeMutationCache } from './_mutation-cache-invalidation.js';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json',
};

export function createAdminCouponsHandler({
  verifyToken = verifyAdminToken,
  getSql = () => neon(process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL),
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
        SELECT
          id, code, description, discount_type, discount_value,
          min_order_zar, max_uses, current_uses, is_active,
          expires_at, created_at, deleted_at
        FROM promo_coupons
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC
      `;
      return { statusCode: 200, headers, body: JSON.stringify(rows) };
    }

    if (event.httpMethod === 'POST') {
      const { code, description, discount_type, discount_value, min_order_zar, max_uses, expires_at } =
        JSON.parse(event.body || '{}');

      if (!code || !discount_value || !discount_type) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'code, discount_type and discount_value required' }) };
      }
      if (!['percent', 'fixed'].includes(discount_type)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'discount_type must be percent or fixed' }) };
      }
      if (parseFloat(discount_value) <= 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'discount_value must be > 0' }) };
      }

      const code_clean = code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');

      const [row] = await sql`
        INSERT INTO promo_coupons
          (code, description, discount_type, discount_value, min_order_zar, max_uses, expires_at)
        VALUES
          (${code_clean},
           ${description || null},
           ${discount_type},
           ${discount_value},
           ${min_order_zar || null},
           ${max_uses || null},
           ${expires_at || null})
        RETURNING *
      `;
      await purgeMutationCache('promo', purgeTags, context);
      return { statusCode: 201, headers, body: JSON.stringify(row) };
    }

    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const { id, is_active, description, max_uses, expires_at, discount_value } = body;

      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };

      const [row] = await sql`
        UPDATE promo_coupons SET
          is_active      = COALESCE(${is_active ?? null}::BOOLEAN, is_active),
          description    = COALESCE(${description    ?? null}, description),
          max_uses       = COALESCE(${max_uses       ?? null}::INTEGER, max_uses),
          expires_at     = COALESCE(${expires_at     ?? null}::TIMESTAMPTZ, expires_at),
          discount_value = COALESCE(${discount_value ?? null}::NUMERIC, discount_value),
          updated_at     = NOW()
        WHERE id = ${id} AND deleted_at IS NULL
        RETURNING *
      `;
      if (!row) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Coupon not found' }) };
      await purgeMutationCache('promo', purgeTags, context);
      return { statusCode: 200, headers, body: JSON.stringify(row) };
    }

    if (event.httpMethod === 'DELETE') {
      const { id } = JSON.parse(event.body || '{}');
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };

      const [row] = await sql`
        UPDATE promo_coupons SET deleted_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL
        RETURNING id
      `;
      if (!row) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Coupon not found' }) };
      await purgeMutationCache('promo', purgeTags, context);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('admin-coupons error:', err);
    if (err.message?.includes('duplicate key')) {
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'Coupon code already exists' }) };
    }
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
  };
}

export const handler = createAdminCouponsHandler();
