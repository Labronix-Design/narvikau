import { neon } from '@neondatabase/serverless';
import { verifyAdminToken } from './admin-auth.js';
import { snapshotQueries } from './admin-categories.js';
import { purgeMutationCache } from './_mutation-cache-invalidation.js';

const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

const PRODUCT_FIELDS = new Set([
  'slug', 'name', 'category', 'size', 'color', 'description', 'image_url',
  'is_active', 'sort_order', 'gallery_urls', 'material', 'thickness',
  'front_door_window', 'side_door', 'rear_door', 'vehicle_fit', 'specifications',
]);
const PRODUCT_UPDATE_FIELDS = new Set(['id', ...PRODUCT_FIELDS]);
const VARIANT_CREATE_FIELDS = new Set([
  'variant', 'product_id', 'variant_type', 'variant_value', 'label', 'is_active', 'sort_order',
]);
const VARIANT_UPDATE_FIELDS = new Set([
  'variant', 'id', 'product_id', 'variant_type', 'variant_value', 'label', 'is_active', 'sort_order',
]);
const SAFE_PRODUCT_IDENTIFIER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UNSAFE_SPECIFICATION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_SORT_ORDER = 100000;

function response(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function parseBody(rawBody) {
  try {
    const body = JSON.parse(rawBody || '{}');
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

function hasOnlyFields(body, allowed) {
  return Object.keys(body).every((field) => allowed.has(field));
}

function positiveInteger(value) {
  const integer = Number(value);
  return Number.isSafeInteger(integer) && integer > 0 ? integer : null;
}

function text(value, { required = false, maximum = 2000 } = {}) {
  if (value === undefined || value === null) return required ? null : '';
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if ((required && !trimmed) || trimmed.length > maximum || /[\u0000-\u001F\u007F]/.test(trimmed)) return null;
  return trimmed;
}

function identifier(value, maximum) {
  const normalised = text(value, { required: true, maximum });
  return normalised !== null && SAFE_PRODUCT_IDENTIFIER.test(normalised) ? normalised : null;
}

function boundedInteger(value, { fallback = MAX_SORT_ORDER } = {}) {
  const integer = value === undefined ? fallback : value;
  return typeof integer === 'number' && Number.isSafeInteger(integer) && integer >= 1 && integer <= MAX_SORT_ORDER ? integer : null;
}

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function specifications(value) {
  if (value === undefined) return {};
  if (!plainObject(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > 30) return null;
  const normalised = {};
  for (const [label, detail] of entries) {
    const safeLabel = text(label, { required: true, maximum: 120 });
    const safeDetail = text(detail, { required: true, maximum: 1000 });
    if (safeLabel === null || safeDetail === null || UNSAFE_SPECIFICATION_KEYS.has(safeLabel)) return null;
    Object.defineProperty(normalised, safeLabel, {
      value: safeDetail,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return normalised;
}

function validateProduct(body, { updating = false } = {}) {
  if (!hasOnlyFields(body, updating ? PRODUCT_UPDATE_FIELDS : PRODUCT_FIELDS)) return null;
  const id = updating ? positiveInteger(body.id) : undefined;
  const slug = identifier(body.slug, 120);
  const name = text(body.name, { required: true, maximum: 160 });
  const category = identifier(body.category, 120);
  const productSpecifications = specifications(body.specifications);
  if ((updating && !id) || slug === null || name === null || category === null || productSpecifications === null) return null;
  if (body.is_active !== undefined && typeof body.is_active !== 'boolean') return null;
  const sortOrder = body.sort_order === undefined && updating ? null : boundedInteger(body.sort_order);
  if (sortOrder === null && !(body.sort_order === undefined && updating)) return null;
  if (body.gallery_urls !== undefined && (!Array.isArray(body.gallery_urls)
    || body.gallery_urls.length > 30
    || body.gallery_urls.some((url) => text(url, { required: true, maximum: 500 }) === null))) return null;

  const optionalText = {};
  for (const [field, maximum] of [
    ['size', 80], ['color', 80], ['description', 4000], ['image_url', 500],
    ['material', 160], ['thickness', 80], ['front_door_window', 300],
    ['side_door', 300], ['rear_door', 300], ['vehicle_fit', 1000],
  ]) {
    const value = text(body[field], { maximum });
    if (value === null) return null;
    optionalText[field] = value || null;
  }

  return {
    ...(updating ? { id } : {}),
    slug,
    name,
    category,
    size: optionalText.size,
    color: optionalText.color || 'black',
    description: optionalText.description,
    image_url: optionalText.image_url,
    is_active: body.is_active !== false,
    sort_order: sortOrder,
    gallery_urls: (body.gallery_urls || []).map((url) => url.trim()),
    material: optionalText.material,
    thickness: optionalText.thickness,
    front_door_window: optionalText.front_door_window,
    side_door: optionalText.side_door,
    rear_door: optionalText.rear_door,
    vehicle_fit: optionalText.vehicle_fit,
    specifications: productSpecifications,
  };
}

function validateVariant(body) {
  const updating = Object.hasOwn(body, 'id');
  if (!hasOnlyFields(body, updating ? VARIANT_UPDATE_FIELDS : VARIANT_CREATE_FIELDS)) return null;
  const id = updating ? positiveInteger(body.id) : undefined;
  const productId = positiveInteger(body.product_id);
  const variantType = text(body.variant_type, { required: true, maximum: 80 });
  const variantValue = text(body.variant_value, { required: true, maximum: 120 });
  const label = text(body.label, { required: true, maximum: 160 });
  const sortOrder = body.sort_order === undefined && updating ? null : boundedInteger(body.sort_order);
  if ((updating && !id) || !productId || variantType === null || variantValue === null || label === null
    || (sortOrder === null && !(body.sort_order === undefined && updating)) || (body.is_active !== undefined && typeof body.is_active !== 'boolean')) return null;
  return {
    ...(updating ? { id } : {}),
    product_id: productId,
    variant_type: variantType,
    variant_value: variantValue,
    label,
    is_active: body.is_active !== false,
    sort_order: sortOrder,
  };
}

async function hasActiveCategory(sql, categorySlug) {
  const [category] = await sql`
    SELECT slug, is_active FROM catalog_categories
    WHERE slug = ${categorySlug} AND is_active = TRUE
    LIMIT 1
  `;
  return category?.is_active === true;
}

async function mutateAndRebuild(sql, mutation) {
  if (typeof sql.transaction !== 'function') throw new Error('Database transaction support is unavailable');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const [, rows] = await sql.transaction(
        (tx) => [tx`SELECT pg_advisory_xact_lock(1350564182, 1)`, mutation(tx), ...snapshotQueries(tx)],
        { isolationLevel: 'ReadCommitted' },
      );
      return rows?.[0];
    } catch (error) {
      if (!['40001', '40P01'].includes(error?.code) || attempt === 2) throw error;
    }
  }
}

export function createAdminProductsHandler({
  verifyToken = verifyAdminToken,
  getSql = () => neon(process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL),
  purgeTags,
} = {}) {
  return async (event = {}, context) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    try {
      if (!await verifyToken(event)) return response(401, { error: 'Unauthorized' });
    } catch {
      return response(503, { error: 'Service unavailable' });
    }

    try {
      if (event.httpMethod === 'GET') {
        const sql = getSql();
        const params = event.queryStringParameters || {};
        if (params.variants === '1') {
          const productId = positiveInteger(params.product_id);
          if (!productId) return response(400, { error: 'A valid product_id is required' });
          const variants = await sql`
            SELECT id, product_id, variant_type, variant_value, label, is_active, sort_order, created_at
            FROM product_variants
            WHERE product_id = ${productId}
            ORDER BY variant_type ASC, sort_order ASC, id ASC
          `;
          return response(200, variants);
        }
        if (Object.keys(params).length) return response(400, { error: 'Unsupported query parameters' });
        const products = await sql`
          SELECT id, slug, name, category, size, color, description, image_url, is_active,
            sort_order, gallery_urls, material, thickness, front_door_window, side_door,
            rear_door, vehicle_fit, specifications, created_at, updated_at
          FROM catalog_products
          ORDER BY sort_order ASC, created_at DESC
        `;
        return response(200, products);
      }

      if (!['POST', 'PUT', 'DELETE'].includes(event.httpMethod)) return response(405, { error: 'Method not allowed' });
      const body = parseBody(event.body);
      if (!body) return response(400, { error: 'Invalid request' });

      if (event.httpMethod === 'POST') {
        const product = validateProduct(body);
        if (!product) return response(400, { error: 'A valid product is required' });
        const sql = getSql();
        if (!await hasActiveCategory(sql, product.category)) {
          return response(422, { error: 'Select an active catalogue category' });
        }
        const row = await mutateAndRebuild(sql, (tx) => tx`
          INSERT INTO catalog_products (
            slug, name, category, size, color, description, image_url, is_active, sort_order,
            gallery_urls, material, thickness, front_door_window, side_door, rear_door, vehicle_fit,
            specifications
          ) VALUES (
            ${product.slug}, ${product.name}, ${product.category}, ${product.size}, ${product.color},
            ${product.description}, ${product.image_url}, ${product.is_active}, ${product.sort_order},
            ${product.gallery_urls}, ${product.material}, ${product.thickness}, ${product.front_door_window},
            ${product.side_door}, ${product.rear_door}, ${product.vehicle_fit}, ${JSON.stringify(product.specifications)}::jsonb
          )
          RETURNING *
        `);
        await purgeMutationCache('product', purgeTags, context);
        return response(201, row);
      }

      if (event.httpMethod === 'PUT' && body.variant === true) {
        const variant = validateVariant(body);
        if (!variant) return response(400, { error: 'A valid variant is required' });
        const sql = getSql();
        const row = await mutateAndRebuild(sql, (tx) => variant.id
          ? tx`
              UPDATE product_variants SET
                product_id = ${variant.product_id}, variant_type = ${variant.variant_type},
                variant_value = ${variant.variant_value}, label = ${variant.label},
                is_active = ${variant.is_active}, sort_order = COALESCE(${variant.sort_order}, sort_order)
              WHERE id = ${variant.id}
              RETURNING *
            `
          : tx`
              INSERT INTO product_variants (product_id, variant_type, variant_value, label, is_active, sort_order)
              VALUES (${variant.product_id}, ${variant.variant_type}, ${variant.variant_value}, ${variant.label}, ${variant.is_active}, ${variant.sort_order})
              RETURNING *
            `);
        if (!row) return response(404, { error: 'Variant not found' });
        await purgeMutationCache('product', purgeTags, context);
        return response(200, row);
      }

      if (event.httpMethod === 'PUT') {
        const product = validateProduct(body, { updating: true });
        if (!product) return response(400, { error: 'A valid product is required' });
        const sql = getSql();
        if (!await hasActiveCategory(sql, product.category)) {
          return response(422, { error: 'Select an active catalogue category' });
        }
        const row = await mutateAndRebuild(sql, (tx) => tx`
          UPDATE catalog_products SET
            slug = ${product.slug}, name = ${product.name}, category = ${product.category},
            size = ${product.size}, color = ${product.color}, description = ${product.description},
            image_url = ${product.image_url}, is_active = ${product.is_active}, sort_order = COALESCE(${product.sort_order}, sort_order),
            gallery_urls = ${product.gallery_urls}, material = ${product.material}, thickness = ${product.thickness},
            front_door_window = ${product.front_door_window}, side_door = ${product.side_door},
            rear_door = ${product.rear_door}, vehicle_fit = ${product.vehicle_fit},
            specifications = ${JSON.stringify(product.specifications)}::jsonb, updated_at = NOW()
          WHERE id = ${product.id}
          RETURNING *
        `);
        if (!row) return response(404, { error: 'Product not found' });
        await purgeMutationCache('product', purgeTags, context);
        return response(200, row);
      }

      if (!hasOnlyFields(body, new Set(['id', 'variant']))) return response(400, { error: 'Invalid request' });
      const id = positiveInteger(body.id);
      if (!id) return response(400, { error: 'A valid id is required' });
      const sql = getSql();
      const deleted = await mutateAndRebuild(sql, (tx) => body.variant === true
        ? tx`DELETE FROM product_variants WHERE id = ${id} RETURNING id`
        : tx`DELETE FROM catalog_products WHERE id = ${id} RETURNING id`);
      if (!deleted) return response(404, { error: body.variant === true ? 'Variant not found' : 'Product not found' });
      await purgeMutationCache('product', purgeTags, context);
      return response(200, { ok: true });
    } catch (error) {
      if (error?.code === 'CACHE_REFRESH_PENDING') {
        return response(503, { error: 'Your catalogue change was saved, but the storefront refresh is pending. Please retry shortly.' });
      }
      console.error(JSON.stringify({
        level: 'ERROR', fn: 'admin-products', msg: 'Catalogue request failed',
        error: error?.name || 'unknown', code: error?.code, ts: new Date().toISOString(),
      }));
      return response(500, { error: 'Unable to manage products' });
    }
  };
}

export const handler = createAdminProductsHandler();
