import { neon } from '@neondatabase/serverless';
import { verifyAdminToken } from './admin-auth.js';
import { purgeMutationCache } from './_mutation-cache-invalidation.js';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Content-Type': 'application/json',
};

const VALID_PAGES = ['refund', 'terms'];
const VALID_ITEM_TYPES = ['covered', 'excluded', 'check', 'plain'];

function sanitizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter(i => i && typeof i.text === 'string' && i.text.trim())
    .map(i => ({
      text: i.text.trim(),
      type: VALID_ITEM_TYPES.includes(i.type) ? i.type : 'plain',
    }));
}

function sanitizeSections(sections) {
  if (!Array.isArray(sections)) return [];
  return sections
    .filter(s => s && typeof s.title === 'string' && s.title.trim())
    .map(s => ({
      icon: typeof s.icon === 'string' && s.icon.trim() ? s.icon.trim() : 'info',
      title: s.title.trim(),
      intro: typeof s.intro === 'string' ? s.intro.trim() : '',
      items: sanitizeItems(s.items),
    }));
}

function sanitizeContent(body) {
  return {
    badge: typeof body.badge === 'string' ? body.badge.trim() : '',
    title_main: typeof body.title_main === 'string' ? body.title_main.trim() : '',
    title_highlight: typeof body.title_highlight === 'string' ? body.title_highlight.trim() : '',
    intro: typeof body.intro === 'string' ? body.intro.trim() : '',
    sections: sanitizeSections(body.sections),
    disclaimer_title: typeof body.disclaimer_title === 'string' ? body.disclaimer_title.trim() : '',
    disclaimer_paragraphs: Array.isArray(body.disclaimer_paragraphs)
      ? body.disclaimer_paragraphs.filter(p => typeof p === 'string' && p.trim()).map(p => p.trim())
      : [],
  };
}

export function createAdminLegalPagesHandler({
  verifyToken = verifyAdminToken,
  getSql = () => neon(process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL),
  purgeTags,
} = {}) {
  return async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const authed = await verifyToken(event);
  if (!authed) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };

  const page = event.queryStringParameters?.page;
  if (!VALID_PAGES.includes(page)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'page must be one of: refund, terms' }) };
  }

  const sql = getSql();
  try {
    if (event.httpMethod === 'GET') {
      const [row] = await sql`SELECT content FROM legal_pages_settings WHERE page = ${page}`;
      return { statusCode: 200, headers, body: JSON.stringify(row?.content || {}) };
    }

    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const content = sanitizeContent(body);

      const [row] = await sql`
        INSERT INTO legal_pages_settings (page, content, updated_at)
        VALUES (${page}, ${JSON.stringify(content)}::jsonb, NOW())
        ON CONFLICT (page) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()
        RETURNING content
      `;
      await purgeMutationCache(page === 'refund' ? 'legalRefund' : 'legalTerms', purgeTags, context);
      return { statusCode: 200, headers, body: JSON.stringify(row.content) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('admin-legal-pages error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
  };
}

export const handler = createAdminLegalPagesHandler();
