import { taggedPublicReadHeaders, uncachedResponseHeaders } from './_public-cache.js';

const SECTIONS = new Set(['products']);
const PRODUCT_TEXT_FIELDS = [
  ['size', 80], ['color', 80], ['description', 4000], ['image_url', 500],
  ['material', 160], ['thickness', 80], ['front_door_window', 300],
  ['side_door', 300], ['rear_door', 300], ['vehicle_fit', 1000],
];
const SAFE_PRODUCT_IDENTIFIER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UNSAFE_SPECIFICATION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_SORT_ORDER = 100000;

function text(value, { required = false, maximum = 2000 } = {}) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if ((!trimmed && required) || trimmed.length > maximum || /[\u0000-\u001F\u007F]/.test(trimmed)) return null;
  return trimmed;
}

function identifier(value, maximum) {
  const normalised = text(value, { required: true, maximum });
  return normalised !== null && SAFE_PRODUCT_IDENTIFIER.test(normalised) ? normalised : null;
}

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normaliseSpecifications(value) {
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

function normaliseGallery(value) {
  if (!Array.isArray(value) || value.length > 30) return null;
  const gallery = value.map((url) => text(url, { required: true, maximum: 500 }));
  return gallery.every((url) => url !== null) ? gallery : null;
}

function normaliseProduct(value) {
  if (!plainObject(value)) return null;
  const id = Number(value.id);
  const slug = identifier(value.slug, 120);
  const name = text(value.name, { required: true, maximum: 160 });
  const category = identifier(value.category, 80);
  if (!Number.isSafeInteger(id) || id <= 0 || slug === null || name === null || category === null) return null;

  const product = { id, slug, name, category };
  for (const [field, maximum] of PRODUCT_TEXT_FIELDS) {
    if (!Object.hasOwn(value, field)) continue;
    if (value[field] === null) {
      product[field] = null;
      continue;
    }
    const normalised = text(value[field], { maximum });
    if (normalised === null) return null;
    product[field] = normalised;
  }
  if (Object.hasOwn(value, 'sort_order')) {
    const sortOrder = Number(value.sort_order);
    if (!Number.isSafeInteger(sortOrder) || Math.abs(sortOrder) > MAX_SORT_ORDER) return null;
    product.sort_order = sortOrder;
  }
  product.gallery_urls = Object.hasOwn(value, 'gallery_urls') ? normaliseGallery(value.gallery_urls) : [];
  if (product.gallery_urls === null) return null;
  if (Object.hasOwn(value, 'specifications')) {
    product.specifications = normaliseSpecifications(value.specifications);
    if (product.specifications === null) return null;
  }
  return product;
}

export function normaliseCatalogueProducts(payload) {
  return Array.isArray(payload) ? payload.map(normaliseProduct).filter(Boolean) : [];
}

function assertSections(sections) {
  const requested = [...new Set(sections)];
  if (!requested.length || !requested.every((section) => SECTIONS.has(section))) {
    throw new Error('Unknown catalogue cache section');
  }
  return requested;
}

async function buildProducts(sql) {
  const products = await sql`
    SELECT id, slug, name, category, size, color, description, image_url,
      sort_order, gallery_urls, material, thickness, front_door_window,
      side_door, rear_door, vehicle_fit, specifications
    FROM catalog_products
    WHERE is_active = TRUE
    ORDER BY sort_order ASC, name ASC
  `;
  return normaliseCatalogueProducts(products);
}

const BUILDERS = { products: buildProducts };

export async function rebuildCatalogueReadModels(sql, sections = ['products']) {
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
  return normaliseCatalogueProducts(cached?.payload);
}

export function catalogueCacheHeaders(section) {
  assertSections([section]);
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
