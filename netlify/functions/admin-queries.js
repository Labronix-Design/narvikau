import { neon } from '@neondatabase/serverless';
import { verifyAdminToken } from './admin-auth.js';
import { invalidateControlCentreSections, selectInvalidationSections } from './admin-control-centre.js';
import { ENQUIRY_TYPES, enquiryText, SubmissionValidationError, validateEnquiryDetails } from './_enquiry-details.js';

const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};
const VALID_STATUSES = ['new', 'contacted', 'quoted', 'awaiting_customer_information', 'ready_to_quote', 'quote_sent', 'quote_followed_up', 'follow_up_later', 'converted', 'closed'];
const UPDATE_FIELDS = new Set(['id', 'status', 'admin_notes', 'follow_up_date', 'follow_up_note']);
const CREATE_FIELDS = new Set([
  'name', 'email', 'phone', 'company', 'product', 'message', 'status', 'admin_notes',
  'enquiry_type', 'location_state', 'location_suburb', 'discovery_source', 'discovery_source_detail', 'follow_up_date', 'follow_up_note',
]);
const log = {
  error: (msg, d = {}) => console.error(JSON.stringify({ level: 'ERROR', fn: 'admin-queries', msg, ...d, ts: new Date().toISOString() })),
};
const response = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

function parseBody(raw) {
  const body = JSON.parse(raw || '{}');
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new SyntaxError('Expected an object');
  return body;
}

function followUpDate(value) {
  if (typeof value !== 'string') throw new SubmissionValidationError('Invalid follow-up date');
  if (value === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new SubmissionValidationError('Invalid follow-up date');
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value || value.startsWith('0000')) throw new SubmissionValidationError('Invalid follow-up date');
  return value;
}

function parseUpdateBody(raw) {
  try {
    const body = parseBody(raw);
    if (Object.keys(body).some(key => !UPDATE_FIELDS.has(key))
      || !Number.isSafeInteger(body.id) || body.id < 1
      || (body.status === undefined && body.admin_notes === undefined && body.follow_up_date === undefined && body.follow_up_note === undefined)
      || (body.status !== undefined && !VALID_STATUSES.includes(body.status))
      || (body.admin_notes !== undefined && typeof body.admin_notes !== 'string')
      || (body.follow_up_note !== undefined && typeof body.follow_up_note !== 'string')) return null;
    const adminNotes = body.admin_notes === undefined ? undefined : enquiryText(body.admin_notes, 'admin_notes', { maxLength: 4000, multiline: true });
    return { id: body.id, status: body.status, admin_notes: adminNotes,
      follow_up_date: body.follow_up_date === undefined ? undefined : followUpDate(body.follow_up_date),
      follow_up_note: body.follow_up_note === undefined ? undefined : enquiryText(body.follow_up_note, 'follow_up_note', { maxLength: 4000, multiline: true }) };
  } catch {
    return null;
  }
}

function validateManualLead(body) {
  if (Object.keys(body).some(key => !CREATE_FIELDS.has(key)) || !ENQUIRY_TYPES.includes(body.enquiry_type)) throw new SubmissionValidationError('Invalid manual enquiry');
  if (body.follow_up_note !== undefined && typeof body.follow_up_note !== 'string') throw new SubmissionValidationError('Invalid follow-up note');
  const name = enquiryText(body.name, 'name', { required: true, maxLength: 160 });
  const email = enquiryText(body.email, 'email', { required: true, maxLength: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SubmissionValidationError('Invalid email');
  const status = body.status === undefined ? 'new' : body.status;
  if (!VALID_STATUSES.includes(status)) throw new SubmissionValidationError('Invalid status');
  const details = validateEnquiryDetails({ LocationState: body.location_state, LocationSuburb: body.location_suburb, DiscoverySource: body.discovery_source, DiscoverySourceDetail: body.discovery_source_detail });
  return {
    name, email, status, enquiryType: body.enquiry_type,
    phone: enquiryText(body.phone, 'phone', { maxLength: 50 }),
    company: enquiryText(body.company, 'company', { required: ['dealer_enquiry', 'fitment_enquiry'].includes(body.enquiry_type), maxLength: 160 }),
    product: enquiryText(body.product, 'product', { required: body.enquiry_type === 'product_quote', maxLength: 160 }),
    message: enquiryText(body.message, 'message', { maxLength: 4000, multiline: true }),
    adminNotes: enquiryText(body.admin_notes, 'admin_notes', { maxLength: 4000, multiline: true }),
    followUpDate: body.follow_up_date === undefined ? null : followUpDate(body.follow_up_date),
    followUpNote: enquiryText(body.follow_up_note, 'follow_up_note', { maxLength: 4000, multiline: true }),
    ...details,
  };
}

function parseFilters(params) {
  if (Object.keys(params).some(key => !['status', 'enquiry_type', 'limit', 'offset'].includes(key))) return null;
  const status = params.status || null;
  const enquiryType = params.enquiry_type || null;
  const limitText = params.limit ?? '50';
  const offsetText = params.offset ?? '0';
  if ((status && !VALID_STATUSES.includes(status)) || (enquiryType && !ENQUIRY_TYPES.includes(enquiryType))
    || typeof limitText !== 'string' || !/^\d+$/.test(limitText)
    || typeof offsetText !== 'string' || !/^\d+$/.test(offsetText)) return null;
  const limit = Number(limitText); const offset = Number(offsetText);
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(offset)) return null;
  return { status, enquiryType, limit: Math.min(limit, 200), offset };
}

function defaultGetSql() {
  if (!process.env.NETLIFY_DATABASE_URL) throw new Error('Database configuration is missing');
  return neon(process.env.NETLIFY_DATABASE_URL);
}

export function createHandler({ verifyAdminToken: verify = verifyAdminToken, getSql = defaultGetSql, invalidateSections = invalidateControlCentreSections } = {}) {
  return async event => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (!['GET', 'POST', 'PUT'].includes(event.httpMethod)) return response(405, { error: 'Method not allowed' });
    try {
      if (!await verify(event)) return response(401, { error: 'Unauthorized' });

      const invalidate = async sql => {
        try {
          await invalidateSections(sql, selectInvalidationSections('leads'));
        } catch (error) {
          // The lead is already durable. Do not prompt duplicate creation on a cache failure.
          log.error('cache invalidation failed after persistence', { error: error?.name || 'unknown' });
        }
      };

      if (event.httpMethod === 'GET') {
        const filters = parseFilters(event.queryStringParameters || {});
        if (!filters) return response(400, { error: 'Invalid lead filters' });
        const { status, enquiryType, limit, offset } = filters;
        const sql = getSql();
        const [rows, [totals]] = await Promise.all([
          sql`
            SELECT id, source, name, email, phone, company, product, message,
                   enquiry_type, location_state, location_suburb, discovery_source, discovery_source_detail,
                   status, admin_notes, follow_up_date, follow_up_note, customer_id, created_at, updated_at
            FROM leads
            WHERE (${status}::text IS NULL OR status = ${status})
              AND (${enquiryType}::text IS NULL OR enquiry_type = ${enquiryType})
            ORDER BY created_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}
          `,
          sql`
            SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'new') AS new_count,
              COUNT(*) FILTER (WHERE status = 'contacted') AS contacted,
              COUNT(*) FILTER (WHERE status IN ('quoted', 'quote_sent', 'quote_followed_up')) AS quoted,
              COUNT(*) FILTER (WHERE status = 'quoted') AS legacy_quoted,
              COUNT(*) FILTER (WHERE status = 'awaiting_customer_information') AS awaiting_customer_information,
              COUNT(*) FILTER (WHERE status = 'ready_to_quote') AS ready_to_quote,
              COUNT(*) FILTER (WHERE status = 'quote_sent') AS quote_sent,
              COUNT(*) FILTER (WHERE status = 'quote_followed_up') AS quote_followed_up,
              COUNT(*) FILTER (WHERE status = 'follow_up_later') AS follow_up_later,
              COUNT(*) FILTER (WHERE status = 'converted') AS converted,
              COUNT(*) FILTER (WHERE status = 'closed') AS closed
            FROM leads
          `,
        ]);
        return response(200, { rows, totals });
      }

      if (event.httpMethod === 'POST') {
        let manual;
        try { manual = validateManualLead(parseBody(event.body)); }
        catch (error) {
          if (error instanceof SyntaxError) return response(400, { error: 'Invalid request body' });
          if (error instanceof SubmissionValidationError) return response(422, { error: 'Check the enquiry details and try again' });
          throw error;
        }
        const sql = getSql();
        const nameParts = manual.name.split(/\s+/);
        const [row] = await sql`
          WITH customer AS (
            INSERT INTO customers (first_name, last_name, email, phone, updated_at)
            VALUES (${nameParts[0]}, ${nameParts.slice(1).join(' ')}, ${manual.email}, ${manual.phone || null}, NOW())
            ON CONFLICT (email) DO UPDATE SET
              first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
              phone = COALESCE(EXCLUDED.phone, customers.phone), updated_at = NOW()
            RETURNING id
          )
          INSERT INTO leads (source, name, email, phone, company, product, message, customer_id, status, admin_notes,
            enquiry_type, location_state, location_suburb, discovery_source, discovery_source_detail, follow_up_date, follow_up_note)
          SELECT 'manual', ${manual.name}, ${manual.email}, ${manual.phone || null}, ${manual.company || null}, ${manual.product || null},
            ${manual.message || null}, customer.id, ${manual.status}, ${manual.adminNotes || null}, ${manual.enquiryType},
            ${manual.LocationState}, ${manual.LocationSuburb}, ${manual.DiscoverySource}, ${manual.DiscoverySourceDetail || null}, ${manual.followUpDate}::date, ${manual.followUpNote || null}
          FROM customer
          RETURNING id, source, name, email, phone, company, product, message, status, admin_notes, customer_id,
            enquiry_type, location_state, location_suburb, discovery_source, discovery_source_detail, follow_up_date, follow_up_note, created_at, updated_at
        `;
        if (!row?.id) throw new Error('Lead persistence failed');
        await invalidate(sql);
        return response(201, row);
      }

      const update = parseUpdateBody(event.body);
      if (!update) return response(400, { error: 'Invalid lead update' });
      const sql = getSql();
      const [row] = await sql`
        UPDATE leads SET
          status = COALESCE(${update.status ?? null}::TEXT, status),
          admin_notes = COALESCE(${update.admin_notes ?? null}::TEXT, admin_notes),
          follow_up_date = CASE WHEN ${update.follow_up_date !== undefined} THEN ${update.follow_up_date ?? null}::date ELSE follow_up_date END,
          follow_up_note = CASE WHEN ${update.follow_up_note !== undefined} THEN ${update.follow_up_note ?? null}::text ELSE follow_up_note END,
          updated_at = NOW()
        WHERE id = ${update.id}
        RETURNING id, status, admin_notes, follow_up_date, follow_up_note, updated_at
      `;
      if (!row) return response(404, { error: 'Lead not found' });
      await invalidate(sql);
      return response(200, row);
    } catch (error) {
      log.error('request failed', { error: error instanceof Error ? error.name : 'unknown' });
      return response(500, { error: 'Unable to process lead request' });
    }
  };
}

export const handler = createHandler();
