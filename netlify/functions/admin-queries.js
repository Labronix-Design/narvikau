import { neon } from '@neondatabase/serverless';
import { verifyAdminToken } from './admin-auth.js';
import { invalidateControlCentreSections, selectInvalidationSections } from './admin-control-centre.js';

const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Content-Type': 'application/json',
};

const VALID_STATUSES = ['new', 'contacted', 'quoted', 'converted', 'closed'];
const UPDATE_FIELDS = new Set(['id', 'status', 'admin_notes']);

const log = {
  error: (msg, d = {}) => console.error(JSON.stringify({ level: 'ERROR', fn: 'admin-queries', msg, ...d, ts: new Date().toISOString() })),
};

function parseUpdateBody(raw) {
  let body;
  try {
    body = JSON.parse(raw || '{}');
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some((key) => !UPDATE_FIELDS.has(key))
    || !Number.isSafeInteger(body.id) || body.id < 1
    || (body.status !== undefined && !VALID_STATUSES.includes(body.status))
    || (body.admin_notes !== undefined && (typeof body.admin_notes !== 'string' || body.admin_notes.length > 4000))) return null;
  return { id: body.id, status: body.status, admin_notes: body.admin_notes };
}

export function createHandler({
  verifyAdminToken: verify = verifyAdminToken,
  getSql = () => neon(process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL),
  invalidateSections = invalidateControlCentreSections,
} = {}) {
  return async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const authed = await verify(event);
  if (!authed) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };

  const sql    = getSql();
  const params = event.queryStringParameters || {};

  try {
    if (event.httpMethod === 'GET') {
      const limit  = Math.min(parseInt(params.limit  || '50', 10), 200);
      const offset = parseInt(params.offset || '0', 10);
      const status = params.status || null;

      const [rows, [totals]] = await Promise.all([
        status
          ? sql`
              SELECT id, source, name, email, phone, company, message,
                     status, admin_notes, customer_id, created_at, updated_at
              FROM leads
              WHERE status = ${status}
              ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
            `
          : sql`
              SELECT id, source, name, email, phone, company, message,
                     status, admin_notes, customer_id, created_at, updated_at
              FROM leads
              ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
            `,
        sql`
          SELECT
            COUNT(*)                                           AS total,
            COUNT(*) FILTER (WHERE status = 'new')            AS new_count,
            COUNT(*) FILTER (WHERE status = 'contacted')      AS contacted,
            COUNT(*) FILTER (WHERE status = 'quoted')         AS quoted,
            COUNT(*) FILTER (WHERE status = 'converted')      AS converted,
            COUNT(*) FILTER (WHERE status = 'closed')         AS closed
          FROM leads
        `,
      ]);

      return { statusCode: 200, headers, body: JSON.stringify({ rows, totals }) };
    }

    if (event.httpMethod === 'PUT') {
      const update = parseUpdateBody(event.body);
      if (!update) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid lead update' }) };

      const [row] = await sql`
        UPDATE leads SET
          status      = COALESCE(${update.status ?? null}::TEXT, status),
          admin_notes = COALESCE(${update.admin_notes ?? null}::TEXT, admin_notes),
          updated_at  = NOW()
        WHERE id = ${update.id}
        RETURNING id, status, admin_notes, updated_at
      `;
      if (!row) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Lead not found' }) };
      await invalidateSections(sql, selectInvalidationSections('leads'));
      return { statusCode: 200, headers, body: JSON.stringify(row) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (error) {
    log.error('request failed', { error: error instanceof Error ? error.name : 'unknown' });
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Unable to process lead request' }) };
  }
  };
}

export const handler = createHandler();
