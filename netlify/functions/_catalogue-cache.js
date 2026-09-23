import { taggedPublicReadHeaders, uncachedResponseHeaders } from './_public-cache.js';

const SECTIONS = new Set(['products']);
const CANOPY_SLUGS = new Set([
  'navrik-canopy-adventure',
  'navrik-canopy-overland',
  'navrik-canopy-sports',
  'navrik-canopy-defender',
]);

const PRODUCT_FIELDS = [
  'id', 'slug', 'name', 'category', 'size', 'color', 'description', 'image_url',
  'sort_order', 'gallery_urls', 'material', 'thickness', 'front_door_window',
  'side_door', 'rear_door', 'vehicle_fit',
];

function normaliseProduct(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || value.category !== 'canopy' || !CANOPY_SLUGS.has(value.slug)) return null;
  const product = {};
  for (const field of PRODUCT_FIELDS) {
    if (Object.hasOwn(value, field)) product[field] = value[field];
  }
  product.category = 'canopy';
  product.gallery_urls = Array.isArray(value.gallery_urls)
    ? value.gallery_urls.filter((url) => typeof url === 'string')
    : [];
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
      side_door, rear_door, vehicle_fit
    FROM catalog_products
    WHERE is_active = TRUE AND category = 'canopy'
      AND slug = ANY(${[...CANOPY_SLUGS]})
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
