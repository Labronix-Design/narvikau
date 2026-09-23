import { neon } from '@neondatabase/serverless';
import { taggedPublicReadHeaders, uncachedResponseHeaders } from './_public-cache.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

// Storefront theme, hero, and contact details change only through an admin
// save, so the edge can hold them for a week. Database failures are never
// cached: a momentary outage must not replay fabricated defaults to visitors.
const headers = {
  ...corsHeaders,
  ...taggedPublicReadHeaders({ tags: ['site-settings'], browserSeconds: 300, cdnSeconds: 604800, staleSeconds: 2592000 }),
};

const uncachedHeaders = { ...corsHeaders, ...uncachedResponseHeaders };

const log = {
  error: (msg, d = {}) => console.error(JSON.stringify({ level: 'ERROR', fn: 'site-settings', msg, ...d, ts: new Date().toISOString() })),
};

const DEFAULTS = {
  logo_url: null,
  font_family: 'Inter',
  primary_color: '#ea580c',
  hero_slides: [],
  brand_logos: [],
  contact: {},
  trust_bar: [],
};

// Public, read-only site configuration — logo, theme font/color, hero
// carousel images, compatible-vehicle brand logos, contact details. Powers
// the storefront so these can be changed from the admin panel instead of a
// code deploy. Any field left empty/unset falls back to a frontend default.
const defaultGetSql = () => neon(process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL);

export function createSiteSettingsHandler({ getSql = defaultGetSql } = {}) {
  return async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: uncachedHeaders, body: '' };
    if (event.httpMethod !== 'GET') {
      return { statusCode: 405, headers: uncachedHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
      const sql = getSql();
      const [row] = await sql`SELECT logo_url, font_family, primary_color, hero_slides, brand_logos, contact, trust_bar FROM site_settings WHERE id = 1`;
      return { statusCode: 200, headers, body: JSON.stringify(row || DEFAULTS) };
    } catch (err) {
      log.error('Database read failed', { error: err?.name || 'Error', code: err?.code });
      return { statusCode: 503, headers: uncachedHeaders, body: JSON.stringify({ error: 'Content is temporarily unavailable' }) };
    }
  };
}

export const handler = createSiteSettingsHandler();
