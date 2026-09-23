import { neon } from '@neondatabase/serverless';
import { verifyAdminToken } from './admin-auth.js';
import { rebuildCatalogueReadModels } from './_catalogue-cache.js';
import { purgeMutationCache } from './_mutation-cache-invalidation.js';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Content-Type': 'application/json',
};

export function createAdminCompatibilityHandler({
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
      const matrix = await sql`
        SELECT
          cm.id,
          cm.accessory_id,
          ca.name  AS accessory_name,
          ca.category AS accessory_category,
          cm.tray_type,
          cm.product_id,
          cm.vehicle_make,
          cm.vehicle_model,
          cm.notes,
          cm.created_at
        FROM compatibility_matrix cm
        JOIN catalog_accessories ca ON ca.id = cm.accessory_id
        ORDER BY cm.tray_type, ca.category, ca.name
      `;
      return { statusCode: 200, headers, body: JSON.stringify(matrix) };
    }

    const body = JSON.parse(event.body || '{}');

    if (event.httpMethod === 'POST') {
      const { accessory_id, tray_type, product_id, vehicle_make, vehicle_model, notes } = body;
      if (!accessory_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'accessory_id required' }) };

      const [row] = await sql`
        INSERT INTO compatibility_matrix (accessory_id, tray_type, product_id, vehicle_make, vehicle_model, notes)
        VALUES (${accessory_id}, ${tray_type || null}, ${product_id || null}, ${vehicle_make || null}, ${vehicle_model || null}, ${notes || null})
        ON CONFLICT ON CONSTRAINT compat_unique_rule DO UPDATE SET
          product_id    = EXCLUDED.product_id,
          notes         = EXCLUDED.notes
        RETURNING *
      `;
      await rebuild(sql, ['compatibility']);
      await purgeMutationCache('compatibility', purgeTags, context);
      return { statusCode: 201, headers, body: JSON.stringify(row) };
    }

    if (event.httpMethod === 'DELETE') {
      const { id } = body;
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
      const [deleted] = await sql`DELETE FROM compatibility_matrix WHERE id = ${id} RETURNING id`;
      if (!deleted) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Compatibility rule not found' }) };
      await rebuild(sql, ['compatibility']);
      await purgeMutationCache('compatibility', purgeTags, context);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('admin-compatibility error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Unable to manage compatibility rules' }) };
  }
  };
}

export const handler = createAdminCompatibilityHandler();
