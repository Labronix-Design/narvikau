import { neon } from '@neondatabase/serverless';
import { taggedPublicReadHeaders, uncachedResponseHeaders } from './_public-cache.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

// Finance-page copy changes very rarely, so it is held at the edge for a week.
// Database failures are never cached, so they cannot replay as an empty finance
// page after a transient outage.
const headers = {
  ...corsHeaders,
  ...taggedPublicReadHeaders({ tags: ['finance-page'], browserSeconds: 300, cdnSeconds: 604800, staleSeconds: 2592000 }),
};

const uncachedHeaders = { ...corsHeaders, ...uncachedResponseHeaders };

const log = {
  error: (msg, d = {}) => console.error(JSON.stringify({ level: 'ERROR', fn: 'finance-page', msg, ...d, ts: new Date().toISOString() })),
};

// Public, read-only finance-page content (hero copy, benefit cards, process
// steps, requirements checklist, ABSA CTA block, trust bar). Empty/unset
// fields fall back to the frontend's built-in defaults.
const defaultGetSql = () => neon(process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL);

export function createFinancePageHandler({ getSql = defaultGetSql } = {}) {
  return async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: uncachedHeaders, body: '' };
    if (event.httpMethod !== 'GET') {
      return { statusCode: 405, headers: uncachedHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
      const sql = getSql();
      const [row] = await sql`SELECT content FROM finance_page_settings WHERE id = 1`;
      return { statusCode: 200, headers, body: JSON.stringify(row?.content || {}) };
    } catch (err) {
      log.error('Database read failed', { error: err?.name || 'Error', code: err?.code });
      return { statusCode: 503, headers: uncachedHeaders, body: JSON.stringify({ error: 'Content is temporarily unavailable' }) };
    }
  };
}

export const handler = createFinancePageHandler();
