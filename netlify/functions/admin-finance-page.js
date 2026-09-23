import { neon } from '@neondatabase/serverless';
import { verifyAdminToken } from './admin-auth.js';
import { purgeMutationCache } from './_mutation-cache-invalidation.js';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Content-Type': 'application/json',
};

// Strip anything that isn't a plain string/array-of-plain-objects — this is
// arbitrary marketing copy, not structured data, so we just guard against
// wildly wrong types rather than validating every field individually.
function sanitizeContent(content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return {};
  const out = {};
  for (const [key, value] of Object.entries(content)) {
    if (typeof value === 'string') out[key] = value.trim();
    else if (Array.isArray(value)) out[key] = value;
  }
  return out;
}

export function createAdminFinancePageHandler({
  verifyToken = verifyAdminToken,
  getSql = () => neon(process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL),
  purgeTags,
} = {}) {
  return async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const authed = await verifyToken(event);
  if (!authed) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };

  const sql = getSql();
  try {
    if (event.httpMethod === 'GET') {
      const [row] = await sql`SELECT content FROM finance_page_settings WHERE id = 1`;
      return { statusCode: 200, headers, body: JSON.stringify(row?.content || {}) };
    }

    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const content = sanitizeContent(body);
      const [row] = await sql`
        UPDATE finance_page_settings SET
          content    = ${JSON.stringify(content)}::jsonb,
          updated_at = NOW()
        WHERE id = 1
        RETURNING content
      `;
      if (!row) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Finance page settings not found' }) };
      await purgeMutationCache('financePage', purgeTags, context);
      return { statusCode: 200, headers, body: JSON.stringify(row.content) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('admin-finance-page error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
  };
}

export const handler = createAdminFinancePageHandler();
