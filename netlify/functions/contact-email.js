import { neon } from '@neondatabase/serverless';
import { invalidateControlCentreSections, selectInvalidationSections } from './admin-control-centre.js';
import { createSubmissionRateLimiter, escapeHtml, SubmissionValidationError, validatePublicLead } from './_public-submission.js';

const RESEND_API_KEY = process.env.EMAIL_API_KEY;

function defaultGetSql() {
  return neon(process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL);
}

async function defaultSendEmail(message) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify(message),
  });
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
  return {
    internalHtml: `<!doctype html><html><body><h1>Dealer &amp; Partner Inquiry</h1>${rows}<p><a href="mailto:${email}">Reply by email</a></p></body></html>`,
    clientHtml: `<!doctype html><html><body><h1>Hi ${name},</h1><p>We have received your inquiry.</p>${rows}</body></html>`,
  };
}

export async function persistContactLead({ sql, invalidateSections = invalidateControlCentreSections, lead }) {
  const { Name, Surname, Phone, Email, Message } = lead;
  const nameParts = Name.trim().split(/\s+/);
  const [customer] = await sql`
    INSERT INTO customers (first_name, last_name, email, phone, updated_at)
    VALUES (${nameParts[0]}, ${nameParts.slice(1).join(' ') || ''}, ${Email}, ${Phone || null}, NOW())
    ON CONFLICT (email) DO UPDATE SET
      first_name = EXCLUDED.first_name,
      last_name  = EXCLUDED.last_name,
      phone      = COALESCE(EXCLUDED.phone, customers.phone),
      updated_at = NOW()
    RETURNING id
  `;
  await sql`
    INSERT INTO leads (source, name, email, phone, company, message, customer_id, status)
    VALUES ('contact_form', ${Name}, ${Email}, ${Phone || null}, ${Surname || null}, ${Message || null}, ${customer.id}, 'new')
  `;
  await invalidateSections(sql, selectInvalidationSections('leads'));
}

export function createContactEmailHandler({ getSql = defaultGetSql, sendEmail = defaultSendEmail, rateLimiter } = {}) {
  return async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    let lead;
    try {
      lead = validatePublicLead(JSON.parse(event.body || '{}'));
    } catch (error) {
      if (error instanceof SubmissionValidationError) return { statusCode: 400, body: JSON.stringify({ error: 'Invalid submission' }) };
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid submission' }) };
    }
    const { Name, Surname, Phone, Email, Message } = lead;
    let sql;
    try {
      const limiter = rateLimiter || createSubmissionRateLimiter(sql = getSql());
      const allowed = await limiter.check({ event, source: 'contact_form', email: Email });
      if (!allowed) return { statusCode: 429, body: JSON.stringify({ error: 'Too many submissions. Please try again later.' }) };
    } catch (error) {
      console.error('Contact submission rate limit failed', error?.name || 'unknown error');
      return { statusCode: 503, body: JSON.stringify({ error: 'Submission service unavailable' }) };
    }

    // ── DB write — persist lead so no enquiry is lost ────────────────────
    // Wrapped separately: email still sends even if DB is unreachable.
    try {
      sql ||= getSql();
      await persistContactLead({ sql, lead });
    } catch (dbErr) {
      console.error('Contact submission persistence failed', dbErr?.name || 'unknown error');
      return { statusCode: 503, body: JSON.stringify({ error: 'Submission service unavailable' }) };
    }

    // ── Email ─────────────────────────────────────────────────────────────
    const cleanPhone = (Phone || '').replace(/\D/g, '');
    const firstName  = escapeHtml(Name.split(' ')[0]);
    const dealerName = escapeHtml(Surname || '');
    const safeName = escapeHtml(Name);
    const safeEmail = escapeHtml(Email);
    const safeMessage = escapeHtml(Message || '');

    const rowHtml = (label, val) => !val ? '' : `
      <tr>
        <td style="padding:10px 0;font-size:11px;color:#a3a3a3;text-transform:uppercase;
                   letter-spacing:2px;font-weight:700;white-space:nowrap;
                   border-bottom:1px solid #222;">${label}</td>
        <td style="padding:10px 0 10px 20px;font-size:14px;color:#ffffff;font-weight:600;
                   border-bottom:1px solid #222;">${escapeHtml(val)}</td>
      </tr>`;

    const internalHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:40px 20px;background-color:#050505;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;">
  <tr><td>
    <table width="100%" cellspacing="0" cellpadding="0"
           style="border-top:4px solid #ea580c;background-color:#000000;">
      <tr><td style="padding:32px 36px;">
        <div style="font-size:11px;color:#ea580c;text-transform:uppercase;letter-spacing:3px;
                    font-weight:700;margin-bottom:10px;">Dealer &amp; Partner Inquiry</div>
        <div style="font-size:28px;color:#ffffff;font-weight:900;letter-spacing:-0.5px;">New Inquiry: ${safeName}</div>
        ${dealerName ? `<div style="font-size:14px;color:#a3a3a3;margin-top:6px;">${dealerName}</div>` : ''}
      </td></tr>
    </table>
    <table width="100%" cellspacing="0" cellpadding="0" style="background-color:#141414;padding:32px 36px;">
    <tr><td>
      <div style="font-size:11px;color:#ea580c;text-transform:uppercase;letter-spacing:2px;
                  font-weight:700;margin-bottom:16px;">Contact Details</div>
      <table width="100%" cellspacing="0" cellpadding="0">
        ${rowHtml('Full Name', Name)}
        ${rowHtml('Dealership / Company', Surname)}
        ${rowHtml('Contact Number', Phone)}
        ${rowHtml('Email Address', Email)}
      </table>
      ${Message ? `
      <div style="margin-top:28px;padding:20px 24px;background-color:#1a1a1a;border-left:3px solid #ea580c;">
        <div style="font-size:11px;color:#ea580c;text-transform:uppercase;letter-spacing:2px;
                    font-weight:700;margin-bottom:10px;">Inquiry / Message</div>
        <p style="margin:0;font-size:14px;color:#e0e0e0;line-height:1.7;">${safeMessage}</p>
      </div>` : ''}
      <table width="100%" cellspacing="0" cellpadding="0" style="margin-top:28px;">
        <tr>
          <td style="padding-right:8px;">
            <a href="mailto:${safeEmail}"
               style="display:block;text-align:center;background-color:#141414;color:#ea580c;
                      padding:14px 20px;font-size:13px;font-weight:700;text-decoration:none;
                      border:1px solid #ea580c;letter-spacing:1px;text-transform:uppercase;">
              Reply via Email
            </a>
          </td>
          ${cleanPhone ? `<td style="padding-left:8px;">
            <a href="https://wa.me/${cleanPhone}"
               style="display:block;text-align:center;background-color:#ea580c;color:#ffffff;
                      padding:14px 20px;font-size:13px;font-weight:700;text-decoration:none;
                      letter-spacing:1px;text-transform:uppercase;">
              WhatsApp ${firstName}
            </a>
          </td>` : ''}
        </tr>
      </table>
    </td></tr>
    </table>
    <table width="100%" cellspacing="0" cellpadding="0"
           style="background-color:#0a0a0a;border-top:1px solid #222;">
      <tr><td style="padding:20px 36px;text-align:center;font-size:11px;color:#444;letter-spacing:1px;">
        NAVRIK &mdash; navrik.co.za
      </td></tr>
    </table>
  </td></tr>
  </table>
</body></html>`;

    const clientHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:40px 20px;background-color:#050505;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;">
  <tr><td>
    <table width="100%" cellspacing="0" cellpadding="0"
           style="border-top:4px solid #ea580c;background-color:#000000;">
      <tr><td style="padding:32px 36px;">
        <div style="font-size:11px;color:#ea580c;text-transform:uppercase;letter-spacing:3px;
                    font-weight:700;margin-bottom:10px;">Navrik</div>
        <div style="font-size:28px;color:#ffffff;font-weight:900;letter-spacing:-0.5px;">Hi ${firstName},</div>
        <div style="font-size:15px;color:#a3a3a3;margin-top:8px;line-height:1.6;">
          We've received your inquiry and our team will be in touch within 1 business day.
        </div>
      </td></tr>
    </table>
    <table width="100%" cellspacing="0" cellpadding="0" style="background-color:#141414;padding:32px 36px;">
    <tr><td>
      <div style="font-size:11px;color:#ea580c;text-transform:uppercase;letter-spacing:2px;
                  font-weight:700;margin-bottom:16px;">Your Submission</div>
      <table width="100%" cellspacing="0" cellpadding="0">
        ${rowHtml('Name', Name)}
        ${rowHtml('Dealership / Company', Surname)}
        ${rowHtml('Contact Number', Phone)}
        ${rowHtml('Email Address', Email)}
      </table>
      ${Message ? `
      <div style="margin-top:28px;padding:20px 24px;background-color:#1a1a1a;border-left:3px solid #ea580c;">
        <div style="font-size:11px;color:#ea580c;text-transform:uppercase;letter-spacing:2px;
                    font-weight:700;margin-bottom:10px;">Your Message</div>
        <p style="margin:0;font-size:14px;color:#e0e0e0;line-height:1.7;">${safeMessage}</p>
      </div>` : ''}
      <div style="margin-top:28px;padding:20px 24px;background-color:#1a1a1a;border-left:3px solid #333;">
        <p style="margin:0;font-size:13px;color:#a3a3a3;line-height:1.7;">
          In the meantime, reach us at
          <a href="mailto:info@navrik.co.za" style="color:#ea580c;text-decoration:none;">info@navrik.co.za</a>
          or visit <a href="https://www.navrik.co.za" style="color:#ea580c;text-decoration:none;">navrik.co.za</a>.
        </p>
      </div>
    </td></tr>
    </table>
    <table width="100%" cellspacing="0" cellpadding="0"
           style="background-color:#0a0a0a;border-top:1px solid #222;">
      <tr><td style="padding:20px 36px;text-align:center;font-size:11px;color:#444;letter-spacing:1px;">
        NAVRIK &mdash; Built Tough for Africa &mdash; navrik.co.za
      </td></tr>
    </table>
  </td></tr>
  </table>
</body></html>`;

    const rendered = buildContactEmailHtml(lead);
    await Promise.all([
      sendEmail({
          from: 'Navrik <info@navrik.co.za>',
          to: 'info@navrik.co.za',
          subject: `Dealer Inquiry: ${Name}${Surname ? ` — ${Surname}` : ''}`,
          html: rendered.internalHtml,
        }),
      sendEmail({
          from: 'Navrik <info@navrik.co.za>',
          to: Email,
          subject: `We've received your inquiry — Navrik`,
          html: rendered.clientHtml,
        }),
    ]);

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error('Contact email delivery failed', err?.name || 'unknown error');
    return { statusCode: 500, body: JSON.stringify({ error: 'Unable to send submission confirmation' }) };
  }
  };
}

export const handler = createContactEmailHandler();
