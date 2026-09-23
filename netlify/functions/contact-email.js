import { neon } from '@neondatabase/serverless';
import { invalidateControlCentreSections, selectInvalidationSections } from './admin-control-centre.js';
import { createSubmissionRateLimiter, escapeHtml, SubmissionValidationError, validatePublicLead } from './_public-submission.js';

const MAILBOX = 'info@navrik.com.au';
const FROM = `Navrik <${MAILBOX}>`;

const log = {
  error: (msg, d = {}) => console.error(JSON.stringify({ level: 'ERROR', fn: 'contact-email', msg, ...d, ts: new Date().toISOString() })),
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

export function buildContactEmailHtml(lead) {
  const rows = submissionTable([
    ['Name', lead.Name], ['Dealership / Company', lead.Surname], ['Contact Number', lead.Phone], ['Email Address', lead.Email], ['Message', lead.Message],
  ]);
  const name = escapeHtml(lead.Name.split(/\s+/)[0]);
  const email = escapeHtml(lead.Email);
  const footer = '<p>Navrik Australia · <a href="https://navrik.com.au">navrik.com.au</a></p>';
  return {
    internalHtml: `<!doctype html><html><body><h1>Dealer &amp; Partner Enquiry</h1>${rows}<p><a href="mailto:${email}">Reply by email</a></p>${footer}</body></html>`,
    clientHtml: `<!doctype html><html><body><h1>Hi ${name},</h1><p>We have received your enquiry and will be in touch within one business day.</p>${rows}${footer}</body></html>`,
  };
}

export async function persistContactLead({ sql, invalidateSections = invalidateControlCentreSections, lead }) {
  const { Name, Surname, Phone, Email, Message } = lead;
  const nameParts = Name.trim().split(/\s+/);
  const [customer] = await sql`
    INSERT INTO customers (first_name, last_name, email, phone, updated_at)
    VALUES (${nameParts[0]}, ${nameParts.slice(1).join(' ') || ''}, ${Email}, ${Phone}, NOW())
    ON CONFLICT (email) DO UPDATE SET
      first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
      phone = EXCLUDED.phone, updated_at = NOW()
    RETURNING id
  `;
  if (!customer?.id) throw new Error('Customer persistence failed');
  await sql`
    INSERT INTO leads (source, name, email, phone, company, message, customer_id, status)
    VALUES ('contact_form', ${Name}, ${Email}, ${Phone}, ${Surname || null}, ${Message}, ${customer.id}, 'new')
  `;
  await invalidateSections(sql, selectInvalidationSections('leads'));
}

export function createContactEmailHandler({ getSql = defaultGetSql, sendEmail = defaultSendEmail, rateLimiter } = {}) {
  return async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };

    let lead;
    try {
      lead = validatePublicLead(JSON.parse(event.body || '{}'));
    } catch (error) {
      if (!(error instanceof SubmissionValidationError) && !(error instanceof SyntaxError)) log.error('validation failed', { error: error?.name || 'unknown' });
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid submission' }) };
    }

    let sql;
    try {
      const limiter = rateLimiter || createSubmissionRateLimiter(sql = getSql());
      if (!await limiter.check({ event, source: 'contact_form', email: lead.Email })) {
        return { statusCode: 429, body: JSON.stringify({ error: 'Too many submissions. Please try again later.' }) };
      }
    } catch (error) {
      log.error('rate limit unavailable', { error: error?.name || 'unknown' });
      return { statusCode: 503, body: JSON.stringify({ error: 'Submission service unavailable' }) };
    }

    try {
      sql ||= getSql();
      await persistContactLead({ sql, lead });
    } catch (error) {
      log.error('persistence failed', { error: error?.name || 'unknown' });
      return { statusCode: 503, body: JSON.stringify({ error: 'Submission service unavailable' }) };
    }

    try {
      const rendered = buildContactEmailHtml(lead);
      await Promise.all([
        sendEmail({ from: FROM, to: MAILBOX, subject: `Dealer Enquiry: ${lead.Name}${lead.Surname ? ` — ${lead.Surname}` : ''}`, html: rendered.internalHtml }),
        sendEmail({ from: FROM, to: lead.Email, subject: `We've received your enquiry — Navrik`, html: rendered.clientHtml }),
      ]);
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    } catch (error) {
      log.error('delivery failed', { error: error?.name || 'unknown' });
      return { statusCode: 502, body: JSON.stringify({ error: 'Unable to send submission confirmation' }) };
    }
  };
}

export const handler = createContactEmailHandler();
