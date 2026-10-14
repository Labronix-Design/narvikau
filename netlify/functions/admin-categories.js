import { neon } from '@neondatabase/serverless';
import { verifyAdminToken } from './admin-auth.js';
import { purgeMutationCache } from './_mutation-cache-invalidation.js';

const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

const CATEGORY_FIELDS = new Set(['slug', 'name', 'description', 'sort_order', 'is_active']);
const CATEGORY_UPDATE_FIELDS = new Set(['id', ...CATEGORY_FIELDS]);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function response(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function parseBody(rawBody) {
  try {
    const parsed = JSON.parse(rawBody || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isPositiveId(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function validText(value, maximum, required = false) {
  if (value === undefined || value === null) return required ? null : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if ((required && !trimmed) || trimmed.length > maximum || /[\u0000-\u001F\u007F]/.test(trimmed)) return null;
  return trimmed || null;
}

function validateCategory(body, updating) {
  const allowed = updating ? CATEGORY_UPDATE_FIELDS : CATEGORY_FIELDS;
  if (!Object.keys(body).every((field) => allowed.has(field))) return null;
  if (updating && !isPositiveId(body.id)) return null;
  if (typeof body.slug !== 'string' || body.slug.length < 1 || body.slug.length > 120
    || !SLUG_PATTERN.test(body.slug)) return null;
  const name = validText(body.name, 160, true);
  if (name === null) return null;
  if (body.description !== undefined && body.description !== null && typeof body.description !== 'string') return null;
  const description = validText(body.description, 2000);
  if (body.description !== undefined && body.description !== null && description === null && body.description.trim()) return null;
  const sortOrder = body.sort_order === undefined ? 0 : body.sort_order;
  if (typeof sortOrder !== 'number' || !Number.isSafeInteger(sortOrder) || Math.abs(sortOrder) > 100000) return null;
  if (body.is_active !== undefined && typeof body.is_active !== 'boolean') return null;
  return {
    ...(updating ? { id: body.id } : {}),
    slug: body.slug,
    name,
    description,
    sort_order: sortOrder,
    is_active: body.is_active !== false,
  };
}

function sameCategory(row, requested) {
  return row?.slug === requested.slug
    && row.name === requested.name
    && row.description === requested.description
    && row.sort_order === requested.sort_order
    && row.is_active === requested.is_active;
}

function snapshotQueries(tx) {
  return [
    tx`
      INSERT INTO catalogue_read_models (section, payload, updated_at)
      SELECT 'products', COALESCE(jsonb_agg(jsonb_build_object(
        'id', p.id, 'slug', p.slug, 'name', p.name, 'category', p.category,
        'size', p.size, 'color', p.color, 'description', p.description,
        'image_url', p.image_url, 'sort_order', p.sort_order,
        'gallery_urls', p.gallery_urls, 'material', p.material,
        'thickness', p.thickness, 'front_door_window', p.front_door_window,
        'side_door', p.side_door, 'rear_door', p.rear_door,
        'vehicle_fit', p.vehicle_fit, 'specifications', p.specifications
      ) ORDER BY p.sort_order ASC, p.name ASC), '[]'::jsonb), NOW()
      FROM catalog_products AS p
      JOIN catalog_categories AS c ON c.slug = p.category AND c.is_active = TRUE
      WHERE p.is_active = TRUE
      ON CONFLICT (section) DO UPDATE SET
        payload = EXCLUDED.payload, updated_at = NOW()
    `,
    tx`
      INSERT INTO catalogue_read_models (section, payload, updated_at)
      SELECT 'categories', COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'slug', slug, 'name', name,
        'description', description, 'sort_order', sort_order
      ) ORDER BY sort_order ASC, name ASC), '[]'::jsonb), NOW()
      FROM catalog_categories
      WHERE is_active = TRUE
      ON CONFLICT (section) DO UPDATE SET
        payload = EXCLUDED.payload, updated_at = NOW()
    `,
  ];
}

async function mutateAndRebuild(sql, mutationQuery) {
  if (typeof sql.transaction !== 'function') throw new Error('Database transaction support is unavailable');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const [rows] = await sql.transaction(
        (tx) => [mutationQuery(tx), ...snapshotQueries(tx)],
        { isolationLevel: 'Serializable' },
      );
      return rows?.[0];
    } catch (error) {
      if (error?.code !== '40001' || attempt === 1) throw error;
    }
  }
  return null;
}

export function createAdminCategoriesHandler({
  verifyToken = verifyAdminToken,
  getSql = () => neon(process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL),
  purgeTags,
} = {}) {
  return async (event = {}, context) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(event.httpMethod)) return response(405, { error: 'Method not allowed' });

    try {
      if (!await verifyToken(event)) return response(401, { error: 'Unauthorized' });
    } catch {
      return response(503, { error: 'Service unavailable' });
    }

    if (Object.keys(event.queryStringParameters || {}).length) return response(400, { error: 'Unsupported query parameters' });
    const body = event.httpMethod === 'GET' ? null : parseBody(event.body);
    if (event.httpMethod !== 'GET' && !body) return response(400, { error: 'Invalid request' });

    try {
      if (event.httpMethod === 'GET') {
        const sql = getSql();
        const rows = await sql`
          SELECT id, slug, name, description, sort_order, is_active, created_at, updated_at
          FROM catalog_categories
          ORDER BY sort_order ASC, name ASC
        `;
        return response(200, rows);
      }

      if (event.httpMethod === 'POST' || event.httpMethod === 'PUT') {
        const category = validateCategory(body, event.httpMethod === 'PUT');
        if (!category) return response(400, { error: 'A valid category is required' });
        const sql = getSql();
        const row = await mutateAndRebuild(sql, (tx) => event.httpMethod === 'POST'
          ? tx`
              INSERT INTO catalog_categories (slug, name, description, sort_order, is_active)
              VALUES (${category.slug}, ${category.name}, ${category.description}, ${category.sort_order}, ${category.is_active})
              RETURNING id, slug, name, description, sort_order, is_active, created_at, updated_at
            `
          : tx`
              UPDATE catalog_categories SET
                slug = ${category.slug}, name = ${category.name}, description = ${category.description},
                sort_order = ${category.sort_order}, is_active = ${category.is_active}, updated_at = NOW()
              WHERE id = ${category.id}
              RETURNING id, slug, name, description, sort_order, is_active, created_at, updated_at
            `);
        if (!row) return response(404, { error: 'Category not found' });
        await purgeMutationCache('category', purgeTags, context);
        return response(event.httpMethod === 'POST' ? 201 : 200, row);
      }

      if (Object.keys(body).length !== 1 || !isPositiveId(body.id)) return response(400, { error: 'A valid id is required' });
      const sql = getSql();
      await mutateAndRebuild(sql, (tx) => tx`DELETE FROM catalog_categories WHERE id = ${body.id} RETURNING id`);
      await purgeMutationCache('category', purgeTags, context);
      return response(200, { ok: true });
    } catch (error) {
      if (error?.code === '23505') {
        if (event.httpMethod === 'POST') {
          try {
            const requested = validateCategory(body, false);
            const sql = getSql();
            const [existing] = await sql`
              SELECT id, slug, name, description, sort_order, is_active, created_at, updated_at
              FROM catalog_categories WHERE slug = ${requested.slug} LIMIT 1
            `;
            if (sameCategory(existing, requested)) {
              await purgeMutationCache('category', purgeTags, context);
              return response(200, existing);
            }
          } catch (retryError) {
            if (retryError?.code === 'CACHE_REFRESH_PENDING') {
              return response(503, { error: 'Your catalogue change was saved, but the storefront refresh is pending. Please retry shortly.' });
            }
            console.error(JSON.stringify({
              level: 'ERROR', fn: 'admin-categories', msg: 'Category retry failed',
              error: retryError?.name || 'unknown', code: retryError?.code, ts: new Date().toISOString(),
            }));
            return response(500, { error: 'Unable to manage categories' });
          }
        }
        return response(409, { error: 'A category with this slug already exists' });
      }
      if (event.httpMethod === 'DELETE' && error?.code === '23503') {
        return response(409, { error: 'This category is in use by products' });
      }
      if (error?.code === 'CACHE_REFRESH_PENDING') {
        return response(503, { error: 'Your catalogue change was saved, but the storefront refresh is pending. Please retry shortly.' });
      }
      console.error(JSON.stringify({
        level: 'ERROR', fn: 'admin-categories', msg: 'Category request failed',
        error: error?.name || 'unknown', code: error?.code, ts: new Date().toISOString(),
      }));
      return response(500, { error: 'Unable to manage categories' });
    }
  };
}

export const handler = createAdminCategoriesHandler();
