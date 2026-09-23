import { neon } from '@neondatabase/serverless';
import { verifyAdminToken } from './admin-auth.js';
import { invalidateControlCentreSections, selectInvalidationSections } from './admin-control-centre.js';

const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
  Pragma: 'no-cache',
  Expires: '0',
};

export function createHandler({
  verifyAdminToken: verify = verifyAdminToken,
  getSql = () => neon(process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL),
  invalidateSections = invalidateControlCentreSections,
} = {}) {
  return async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const authed = await verify(event);
  if (!authed) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };

  const sql = getSql();

  try {
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};

      if (params.summary === '1') {
        const [summary] = await sql`
          SELECT
            COUNT(*)                                                            AS total,
            COUNT(*) FILTER (WHERE status = 'pending')                         AS pending,
            COUNT(*) FILTER (WHERE status = 'deposit_paid')                    AS deposit_paid,
            COUNT(*) FILTER (WHERE status = 'in_production')                   AS in_production,
            COUNT(*) FILTER (WHERE status = 'completed')                       AS completed,
            COUNT(*) FILTER (WHERE is_promo_order = TRUE)                      AS promo_orders,
            COALESCE(SUM(total_incl_vat), 0)                                   AS total_value,
            COALESCE(SUM(total_incl_vat) FILTER (WHERE status = 'completed'), 0) AS completed_value
          FROM orders
        `;
        return { statusCode: 200, headers, body: JSON.stringify(summary) };
      }

      const limit  = Math.min(parseInt(params.limit  || '50', 10), 200);
      const offset = parseInt(params.offset || '0', 10);
      const status = params.status || null;

      const rows = status
        ? await sql`
            SELECT * FROM order_invoice
            WHERE status = ${status}
            ORDER BY order_date DESC LIMIT ${limit} OFFSET ${offset}
          `
        : await sql`
            SELECT * FROM order_invoice
            ORDER BY order_date DESC LIMIT ${limit} OFFSET ${offset}
          `;

      return { statusCode: 200, headers, body: JSON.stringify(rows) };
    }

    if (event.httpMethod === 'PUT') {
      const { id, status, notes } = JSON.parse(event.body || '{}');
      if (!id || !status) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id and status required' }) };

      const [updated] = await sql`
        UPDATE orders SET status = ${status}, notes = ${notes || null}, updated_at = NOW()
        WHERE id = ${id}
        RETURNING id
      `;
      if (!updated) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Order not found' }) };
      await sql`
        INSERT INTO order_audit_log (order_id, event, new_status, payload)
        VALUES (${id}, 'admin_status_update', ${status}, ${JSON.stringify({ notes })})
      `;
      await invalidateSections(sql, selectInvalidationSections('orders'));
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('admin-orders error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
  };
}

export const handler = createHandler();
