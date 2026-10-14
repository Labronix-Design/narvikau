import { neon } from '@neondatabase/serverless';
import { verifyAdminToken } from './admin-auth.js';
import { rebuildCatalogueReadModels } from './_catalogue-cache.js';
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

export function createAdminCategoriesHandler({
  verifyToken = verifyAdminToken,
  getSql = () => neon(process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL),
  rebuild = rebuildCatalogueReadModels,
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
        const [row] = event.httpMethod === 'POST'
          ? await sql`
              INSERT INTO catalog_categories (slug, name, description, sort_order, is_active)
              VALUES (${category.slug}, ${category.name}, ${category.description}, ${category.sort_order}, ${category.is_active})
              RETURNING id, slug, name, description, sort_order, is_active, created_at, updated_at
            `
          : await sql`
              UPDATE catalog_categories SET
                slug = ${category.slug}, name = ${category.name}, description = ${category.description},
                sort_order = ${category.sort_order}, is_active = ${category.is_active}, updated_at = NOW()
              WHERE id = ${category.id}
              RETURNING id, slug, name, description, sort_order, is_active, created_at, updated_at
            `;
        if (!row) return response(404, { error: 'Category not found' });
        await rebuild(sql, ['products', 'categories']);
        await purgeMutationCache('category', purgeTags, context);
        return response(event.httpMethod === 'POST' ? 201 : 200, row);
      }

      if (Object.keys(body).length !== 1 || !isPositiveId(body.id)) return response(400, { error: 'A valid id is required' });
      const sql = getSql();
      const [deleted] = await sql`DELETE FROM catalog_categories WHERE id = ${body.id} RETURNING id`;
      if (!deleted) return response(404, { error: 'Category not found' });
      await rebuild(sql, ['products', 'categories']);
      await purgeMutationCache('category', purgeTags, context);
      return response(200, { ok: true });
    } catch (error) {
      if (error?.code === '23505') return response(409, { error: 'A category with this slug already exists' });
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
