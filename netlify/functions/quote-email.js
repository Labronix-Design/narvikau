import { neon } from '@neondatabase/serverless';
import { invalidateControlCentreSections, selectInvalidationSections } from './admin-control-centre.js';
import { createSubmissionRateLimiter, escapeHtml, SubmissionValidationError, validatePublicLead } from './_public-submission.js';
import { enquiryDetailRows } from './_enquiry-details.js';

const MAILBOX = 'info@navrik.com.au';
const FROM = `Navrik <${MAILBOX}>`;

const log = {
  error: (msg, d = {}) => console.error(JSON.stringify({ level: 'ERROR', fn: 'quote-email', msg, ...d, ts: new Date().toISOString() })),
};

function defaultGetSql() {
  if (!process.env.NETLIFY_DATABASE_URL) throw new Error('Database configuration is missing');
  return neon(process.env.NETLIFY_DATABASE_URL);
}

async function defaultSendEmail(message) {
  if (!process.env.EMAIL_API_KEY) throw new Error('Email configuration is missing');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.EMAIL_API_KEY}` },
    body: JSON.stringify(message),
  });
  if (!response.ok) throw new Error('Email provider rejected delivery');
}

function submissionTable(rows) {
  return rows.map(([label, value]) => `<tr><th align="left">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('');
}

export function buildQuoteEmailHtml(lead) {
  const rows = submissionTable([
    ['Name', lead.Name], ['Product', lead.Product], ['Contact Number', lead.Phone], ['Email Address', lead.Email],
    ...enquiryDetailRows(lead), ['Notes', lead.Message],
  ]);
  const name = escapeHtml(lead.Name.split(/\s+/)[0]);
  const email = escapeHtml(lead.Email);
  const footer = '<p>Navrik Australia · <a href="https://navrik.com.au">navrik.com.au</a></p>';
  return {
    internalHtml: `<!doctype html><html><body><h1>Product Quote Request</h1><table>${rows}</table><p><a href="mailto:${email}">Reply by email</a></p>${footer}</body></html>`,
    clientHtml: `<!doctype html><html><body><h1>Hi ${name},</h1><p>We have received your product quote request and will be in touch within one business day.</p><table>${rows}</table>${footer}</body></html>`,
  };
}

export async function persistQuoteLead({ sql, invalidateSections = invalidateControlCentreSections, lead }) {
  const { Name, Phone, Email, Message, Product } = lead;
  const nameParts = Name.trim().split(/\s+/);
  const [stored] = await sql`
    WITH customer AS (
      INSERT INTO customers (first_name, last_name, email, phone, updated_at)
      VALUES (${nameParts[0]}, ${nameParts.slice(1).join(' ') || ''}, ${Email}, ${Phone}, NOW())
      ON CONFLICT (email) DO UPDATE SET
        first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
        phone = EXCLUDED.phone, updated_at = NOW()
      RETURNING id
    )
    INSERT INTO leads (source, name, email, phone, product, message, customer_id, status,
      enquiry_type, location_state, location_suburb, discovery_source, discovery_source_detail)
    SELECT 'product_quote', ${Name}, ${Email}, ${Phone}, ${Product}, ${Message}, customer.id, 'new',
      ${'product_quote'}, ${lead.LocationState}, ${lead.LocationSuburb}, ${lead.DiscoverySource}, ${lead.DiscoverySourceDetail || null}
    FROM customer RETURNING id
  `;
  if (!stored?.id) throw new Error('Lead persistence failed');
  try {
    await invalidateSections(sql, selectInvalidationSections('leads'));
  } catch (error) {
    log.error('cache invalidation failed after persistence', { error: error?.name || 'unknown' });
  }
}

export function createQuoteEmailHandler({ getSql = defaultGetSql, sendEmail = defaultSendEmail, rateLimiter } = {}) {
  return async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };

    let lead;
    try {
      lead = validatePublicLead(JSON.parse(event.body || '{}'), { quote: true });
    } catch (error) {
      if (!(error instanceof SubmissionValidationError) && !(error instanceof SyntaxError)) log.error('validation failed', { error: error?.name || 'unknown' });
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid submission' }) };
    }

    let sql;
    try {
      const limiter = rateLimiter || createSubmissionRateLimiter(sql = getSql());
      if (!await limiter.check({ event, source: 'product_quote', email: lead.Email })) {
        return { statusCode: 429, body: JSON.stringify({ error: 'Too many submissions. Please try again later.' }) };
      }
    } catch (error) {
      log.error('rate limit unavailable', { error: error?.name || 'unknown' });
      return { statusCode: 503, body: JSON.stringify({ error: 'Submission service unavailable' }) };
    }

    try {
      sql ||= getSql();
      await persistQuoteLead({ sql, lead });
    } catch (error) {
      log.error('persistence failed', { error: error?.name || 'unknown' });
      return { statusCode: 503, body: JSON.stringify({ error: 'Submission service unavailable' }) };
    }

    try {
      const rendered = buildQuoteEmailHtml(lead);
      const deliveries = await Promise.allSettled([
        sendEmail({ from: FROM, to: MAILBOX, subject: `Product Quote Request: ${lead.Product} — ${lead.Name}`, html: rendered.internalHtml }),
        sendEmail({ from: FROM, to: lead.Email, subject: `Product quote request received — ${lead.Product} | Navrik`, html: rendered.clientHtml }),
      ]);
      if (deliveries.some(delivery => delivery.status === 'rejected')) throw new Error('Email delivery failed');
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    } catch (error) {
      log.error('delivery failed', { error: error?.name || 'unknown' });
      return { statusCode: 502, body: JSON.stringify({ error: 'Unable to send quote confirmation' }) };
    }
  };
}

export const handler = createQuoteEmailHandler();
