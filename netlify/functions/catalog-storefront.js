import { neon } from '@neondatabase/serverless';
import { taggedPublicReadHeaders, uncachedResponseHeaders } from './_public-cache.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

const headers = {
  ...corsHeaders,
  ...taggedPublicReadHeaders({
    tags: ['catalogue:storefront'],
    browserSeconds: 300,
    cdnSeconds: 604800,
    staleSeconds: 2592000,
  }),
};
const uncachedHeaders = { ...corsHeaders, ...uncachedResponseHeaders };

const DEFAULT_SETTINGS = {
  logo_url: null,
  font_family: 'Inter',
  primary_color: '#ea580c',
  hero_slides: [],
  brand_logos: [],
  contact: {},
  trust_bar: [],
  compat_note: '',
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function createCatalogStorefrontHandler({
  getSql = () => neon(process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL),
} = {}) {
  return async (event = {}) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: uncachedHeaders, body: '' };
    if (event.httpMethod !== 'GET') return { statusCode: 405, headers: uncachedHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
    if (event.queryStringParameters && Object.keys(event.queryStringParameters).length) {
      return { statusCode: 400, headers: uncachedHeaders, body: JSON.stringify({ error: 'Query parameters are not supported' }) };
    }

    try {
      const [model] = await getSql()`
        SELECT
          COALESCE((SELECT payload FROM catalogue_read_models WHERE section = 'products'), '[]'::jsonb) AS products,
          COALESCE((SELECT payload FROM catalogue_read_models WHERE section = 'accessories'), '[]'::jsonb) AS accessories,
          COALESCE((SELECT payload FROM catalogue_read_models WHERE section = 'compatibility'), '[]'::jsonb) AS compatibility,
          COALESCE((SELECT payload FROM catalogue_read_models WHERE section = 'categories'), '[]'::jsonb) AS categories,
          COALESCE((
            SELECT jsonb_build_object(
              'logo_url', logo_url,
              'font_family', font_family,
              'primary_color', primary_color,
              'hero_slides', hero_slides,
              'brand_logos', brand_logos,
              'contact', contact,
              'trust_bar', trust_bar,
              'compat_note', compat_note
            )
            FROM site_settings WHERE id = 1
          ), ${JSON.stringify(DEFAULT_SETTINGS)}::jsonb) AS settings
      `;
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          products: asArray(model?.products),
          accessories: asArray(model?.accessories),
          compatibility: asArray(model?.compatibility),
          categories: asArray(model?.categories),
          settings: model?.settings && typeof model.settings === 'object' && !Array.isArray(model.settings)
            ? model.settings
            : DEFAULT_SETTINGS,
        }),
      };
    } catch (error) {
      console.error('catalog-storefront error:', { name: error?.name || 'Error', code: error?.code });
      return { statusCode: 503, headers: uncachedHeaders, body: JSON.stringify({ error: 'Storefront content is temporarily unavailable' }) };
    }
  };
}

export const handler = createCatalogStorefrontHandler();
