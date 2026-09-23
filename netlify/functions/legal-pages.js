import { neon } from '@neondatabase/serverless';
import { taggedPublicReadHeaders, uncachedResponseHeaders } from './_public-cache.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

// Legal copy changes very rarely, so it is held at the edge for a week.
// Database failures are never cached, so they cannot replay as empty policy
// pages after a transient outage.
const uncachedHeaders = { ...corsHeaders, ...uncachedResponseHeaders };

const log = {
  error: (msg, d = {}) => console.error(JSON.stringify({ level: 'ERROR', fn: 'legal-pages', msg, ...d, ts: new Date().toISOString() })),
};

const VALID_PAGES = ['refund', 'terms'];

// Public, read-only legal-page content (Refund & Warranty Policy, Terms of
// Service). Empty/unset fields fall back to the frontend's built-in defaults.
const defaultGetSql = () => neon(process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL);

export function createLegalPagesHandler({ getSql = defaultGetSql } = {}) {
  return async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: uncachedHeaders, body: '' };
    if (event.httpMethod !== 'GET') {
      return { statusCode: 405, headers: uncachedHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const page = event.queryStringParameters?.page;
    if (!VALID_PAGES.includes(page)) {
      return { statusCode: 400, headers: uncachedHeaders, body: JSON.stringify({ error: 'page must be one of: refund, terms' }) };
    }

    const headers = {
      ...corsHeaders,
      ...taggedPublicReadHeaders({ tags: [`legal:${page}`], browserSeconds: 300, cdnSeconds: 604800, staleSeconds: 2592000 }),
    };

    try {
      const sql = getSql();
      const [row] = await sql`SELECT content FROM legal_pages_settings WHERE page = ${page}`;
      return { statusCode: 200, headers, body: JSON.stringify(row?.content || {}) };
    } catch (err) {
      log.error('Database read failed', { error: err?.name || 'Error', code: err?.code });
      return { statusCode: 503, headers: uncachedHeaders, body: JSON.stringify({ error: 'Content is temporarily unavailable' }) };
    }
  };
}

export const handler = createLegalPagesHandler();
