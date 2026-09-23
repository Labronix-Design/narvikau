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

export function createAdminCategoriesHandler({
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
      const rows = await sql`SELECT * FROM catalog_categories ORDER BY type, sort_order`;
      return { statusCode: 200, headers, body: JSON.stringify(rows) };
    }

    const body = JSON.parse(event.body || '{}');

    if (event.httpMethod === 'POST') {
      const { slug, name, type, eyebrow, icon, description, sort_order } = body;
      if (!slug || !name || !type) return { statusCode: 400, headers, body: JSON.stringify({ error: 'slug, name, type required' }) };
      const [row] = await sql`
        INSERT INTO catalog_categories (slug, name, type, eyebrow, icon, description, sort_order)
        VALUES (${slug}, ${name}, ${type}, ${eyebrow || null}, ${icon || null}, ${description || null}, ${sort_order || 0})
        RETURNING *
      `;
      if (!row) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Category not found' }) };
      await rebuild(sql, ['categories']);
      await purgeMutationCache('category', purgeTags, context);
      return { statusCode: 201, headers, body: JSON.stringify(row) };
    }

    if (event.httpMethod === 'PUT') {
      const { id, slug, name, type, eyebrow, icon, description, sort_order, is_active } = body;
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
      const [row] = await sql`
        UPDATE catalog_categories SET
          slug        = ${slug},
          name        = ${name},
          type        = ${type},
          eyebrow     = ${eyebrow || null},
          icon        = ${icon || null},
          description = ${description || null},
          sort_order  = ${sort_order ?? 0},
          is_active   = ${is_active !== false}
        WHERE id = ${id}
        RETURNING *
      `;
      if (!row) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Category not found' }) };
      await rebuild(sql, ['categories']);
      await purgeMutationCache('category', purgeTags, context);
      return { statusCode: 200, headers, body: JSON.stringify(row) };
    }

    if (event.httpMethod === 'DELETE') {
      const { id } = body;
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
      const [deleted] = await sql`DELETE FROM catalog_categories WHERE id = ${id} RETURNING id`;
      if (!deleted) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Category not found' }) };
      await rebuild(sql, ['categories']);
      await purgeMutationCache('category', purgeTags, context);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('admin-categories error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Unable to manage categories' }) };
  }
  };
}

export const handler = createAdminCategoriesHandler();
