import crypto from 'crypto';
import { neon } from '@neondatabase/serverless';
import { verifyAdminToken } from './admin-auth.js';
import { refreshMonthlySearchConsoleSnapshot } from './admin-search-console.js';

const APPROVED_MONTHLY_RECIPIENTS = ['info@navrik.com.au'];

const log = {
  info: (msg, d = {}) => console.log(JSON.stringify({ level: 'INFO', fn: 'monthly-business-report', msg, ...d, ts: new Date().toISOString() })),
  error: (msg, d = {}) => console.error(JSON.stringify({ level: 'ERROR', fn: 'monthly-business-report', msg, ...d, ts: new Date().toISOString() })),
};

function headersFor(event) {
  const headers = {
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'private, no-store',
    Pragma: 'no-cache',
    Expires: '0',
    Vary: 'Origin',
  };
  const allowedOrigin = process.env.ADMIN_APP_ORIGIN || 'https://navrik.com.au';
  if (event.headers?.origin === allowedOrigin) headers['Access-Control-Allow-Origin'] = allowedOrigin;
  return headers;
}

function response(statusCode, headers, body) { return { statusCode, headers, body: JSON.stringify(body) }; }

function databaseUrl() {
  const url = process.env.NETLIFY_DATABASE_URL;
  if (!url) throw new Error('Database configuration is missing');
  return url;
}

function localDateParts(date, timeZone) {
  const values = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date)
    .filter((part) => part.type !== 'literal');
  return Object.fromEntries(values.map((part) => [part.type, part.value]));
}

function formatLabel(year, month, timeZone) {
  return new Intl.DateTimeFormat('en-AU', { timeZone, month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(year, month - 1, 15, 12)));
}

function dateValue(year, month, day) { return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`; }

export function monthlyPeriodFor(date, kind, timeZone = 'UTC') {
  const parts = localDateParts(date, timeZone);
  let year = Number(parts.year);
  let month = Number(parts.month);
  if (kind === 'previous') {
    month -= 1;
    if (month === 0) { year -= 1; month = 12; }
  }
  const complete = kind === 'previous';
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    startDate: dateValue(year, month, 1),
    endDate: dateValue(year, month, complete ? lastDay : Number(parts.day)),
    complete,
    label: formatLabel(year, month, timeZone),
  };
}

function nextDate(dateValue) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function zonedMidnight(dateValue, timeZone) {
  const [year, month, day] = dateValue.split('-').map(Number);
  const intendedUtc = Date.UTC(year, month - 1, day);
  let candidate = new Date(intendedUtc);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(candidate);
    const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    const displayedAsUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second));
    const corrected = new Date(candidate.getTime() + intendedUtc - displayedAsUtc);
    if (corrected.getTime() === candidate.getTime()) return corrected;
    candidate = corrected;
  }
  return candidate;
}

export function monthlyPeriodTimestampBounds(period, timeZone = 'UTC') {
  return {
    start: zonedMidnight(period.startDate, timeZone).toISOString(),
    endExclusive: zonedMidnight(nextDate(period.endDate), timeZone).toISOString(),
  };
}

function integer(value) {
  const result = Number(value ?? 0);
  return Number.isSafeInteger(result) && result >= 0 ? result : 0;
}

function asObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }

function cachePeriodMatches(cache, period) {
  return cache?.status === 'ready'
    && cache?.period?.startDate === period.startDate
    && cache?.period?.endDate === period.endDate;
}

function searchForPeriod(searchCache, period) {
  if (searchCache?.status === 'setup_required' || searchCache?.status === 'not_measured') {
    return { status: searchCache.status, explanation: typeof searchCache.explanation === 'string' ? searchCache.explanation : 'Search Console has not been measured for this reporting period.', data: null };
  }
  if (!cachePeriodMatches(searchCache, period)) {
    return { status: 'not_measured', explanation: 'Cached Search Console data does not cover this reporting period.', data: null };
  }
  return {
    status: 'ready',
    data: {
      metrics: asObject(searchCache.metrics) || { clicks: 0, impressions: 0, ctr: 0, averagePosition: 0 },
      comparison: asObject(searchCache.comparison) || null,
      topQueries: Array.isArray(searchCache.topQueries) ? searchCache.topQueries : [],
      topPages: Array.isArray(searchCache.topPages) ? searchCache.topPages : [],
      opportunities: Array.isArray(searchCache.opportunities) ? searchCache.opportunities : [],
      websiteAnalytics: asObject(searchCache.websiteAnalytics) || { status: 'not_measured', explanation: 'Google Analytics has not been measured for this reporting period.', metrics: null },
    },
  };
}

function hostingForReport(hosting) {
  if (!asObject(hosting) || hosting.status !== 'ready') {
    return {
      status: 'not_measured',
      explanation: typeof hosting?.explanation === 'string' ? hosting.explanation : 'Hosting usage has not been imported for reporting yet.',
    };
  }
  return {
    status: 'ready',
    explanation: typeof hosting.explanation === 'string' ? hosting.explanation : null,
  };
}

export function buildMonthlyReport({ period, business, searchCache, hosting }) {
  const search = searchForPeriod(searchCache, period);
  const hostingReport = hostingForReport(hosting);
  const leads = { status: 'measured', total: integer(business?.leadCount), converted: integer(business?.convertedLeadCount) };
  const websiteAnalytics = search.status === 'ready' ? search.data.websiteAnalytics : { status: 'not_measured', explanation: search.explanation, metrics: null };
  return {
    leads,
    search,
    websiteAnalytics,
    hosting: hostingReport,
    measurementCoverage: { business: 'measured', search: search.status, websiteAnalytics: websiteAnalytics.status, hosting: hostingReport.status },
  };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function safeText(value) { return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim(); }

export function renderMonthlyReportEmail({ period, report }) {
  const searchMetrics = report.search.status === 'ready' ? report.search.data.metrics : null;
  const analyticsMetrics = report.websiteAnalytics?.status === 'ready' ? report.websiteAnalytics.metrics : null;
  const hostingText = report.hosting.status === 'ready'
    ? (report.hosting.explanation || 'Website operations are connected.')
    : report.hosting.explanation;
  const rows = [
    ['Leads received', report.leads.total],
    ['Leads currently converted', report.leads.converted],
    ['Search Console', searchMetrics ? `${integer(searchMetrics.clicks)} clicks · ${integer(searchMetrics.impressions)} impressions` : 'Not measured yet'],
    ['Website analytics', analyticsMetrics ? `${integer(analyticsMetrics.sessions)} sessions · ${integer(analyticsMetrics.activeUsers)} active users · ${integer(analyticsMetrics.keyEvents)} key events` : 'Not measured yet'],
    ['Website operations', hostingText || 'Not measured yet'],
  ];
  const table = rows.map(([label, value]) => `<tr><td style="padding:11px 0;border-bottom:1px solid #d9d9d9;color:#555;font-size:13px;">${escapeHtml(label)}</td><td style="padding:11px 0 11px 18px;border-bottom:1px solid #d9d9d9;color:#171717;font-size:14px;font-weight:700;text-align:right;">${escapeHtml(value)}</td></tr>`).join('');
  const coverage = Object.entries(report.measurementCoverage).map(([name, status]) => `${name}: ${status === 'measured' || status === 'ready' ? 'Measured' : 'Not measured yet'}`).join(' · ');
  const subject = `Navrik monthly operations report — ${period.label}`;
  return {
    subject,
    text: `${subject}\n\nPeriod: ${safeText(period.startDate)} to ${safeText(period.endDate)}\nLeads received: ${report.leads.total}\nLeads currently converted: ${report.leads.converted}\nSearch Console: ${searchMetrics ? `${integer(searchMetrics.clicks)} clicks, ${integer(searchMetrics.impressions)} impressions` : 'Not measured yet'}\nWebsite analytics: ${analyticsMetrics ? `${integer(analyticsMetrics.sessions)} sessions, ${integer(analyticsMetrics.activeUsers)} active users, ${integer(analyticsMetrics.keyEvents)} key events` : 'Not measured yet'}\nWebsite operations: ${safeText(hostingText || 'Not measured yet')}\nMeasurement coverage: ${safeText(coverage)}`,
    html: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>@media (prefers-color-scheme: dark) { body, .page { background:#101010 !important; } .card { background:#1b1b1b !important; } .title, .value { color:#fff !important; } .label, .foot { color:#c9c9c9 !important; } td { border-color:#3a3a3a !important; } }</style></head><body style="margin:0;padding:32px 16px;background:#f4f4f1;font-family:Arial,Helvetica,sans-serif;"><table class="page" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;"><tr><td><table class="card" width="100%" cellspacing="0" cellpadding="0" style="background:#fff;border-top:4px solid #ea580c;"><tr><td style="padding:30px 32px 18px;"><p style="margin:0 0 8px;color:#ea580c;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Navrik · Internal report</p><h1 class="title" style="margin:0;color:#171717;font-size:26px;line-height:1.2;">Monthly operations report</h1><p class="label" style="margin:10px 0 0;color:#555;font-size:14px;line-height:1.5;">${escapeHtml(period.label)} · ${escapeHtml(period.startDate)} to ${escapeHtml(period.endDate)}</p></td></tr><tr><td style="padding:8px 32px 28px;"><table width="100%" cellspacing="0" cellpadding="0">${table}</table><p class="foot" style="margin:22px 0 0;color:#666;font-size:12px;line-height:1.6;">Measurement coverage: ${escapeHtml(coverage)}. This internal summary supports enquiry and website-operations review only.</p></td></tr></table></td></tr></table></body></html>`,
  };
}

function parseBody(raw) {
  try {
    const body = JSON.parse(raw || '{}');
    if (!asObject(body)) throw new Error();
    return body;
  } catch { throw new Error('Request body must be valid JSON'); }
}

function missingDeliveryConfiguration(env) {
  const missing = ['EMAIL_API_KEY', 'MONTHLY_REPORT_RECIPIENTS'].filter((name) => !env[name]?.trim());
  if (!missing.includes('MONTHLY_REPORT_RECIPIENTS') && !approvedRecipients(env)) missing.push('MONTHLY_REPORT_RECIPIENTS');
  return missing;
}

export function approvedRecipients(env) {
  const values = typeof env.MONTHLY_REPORT_RECIPIENTS === 'string'
    ? env.MONTHLY_REPORT_RECIPIENTS.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)
    : [];
  return values.length === APPROVED_MONTHLY_RECIPIENTS.length
    && new Set(values).size === APPROVED_MONTHLY_RECIPIENTS.length
    && APPROVED_MONTHLY_RECIPIENTS.every((recipient) => values.includes(recipient))
    ? APPROVED_MONTHLY_RECIPIENTS
    : null;
}

async function loadReportInput(sql, period, timeZone) {
  const endExclusiveDate = nextDate(period.endDate);
  const [leads] = await sql`
    SELECT COUNT(*)::INTEGER AS lead_count, COUNT(*) FILTER (WHERE status = 'converted')::INTEGER AS converted_lead_count
    FROM leads
    WHERE created_at >= (${period.startDate}::timestamp AT TIME ZONE ${timeZone})
      AND created_at < (${endExclusiveDate}::timestamp AT TIME ZONE ${timeZone})
  `;
  const [searchSnapshot] = await sql`
    SELECT payload FROM search_console_monthly_snapshots
    WHERE period_start = ${period.startDate}::date AND period_end = ${period.endDate}::date
    LIMIT 1
  `;
  const [hostingCache] = await sql`
    SELECT payload FROM control_centre_cache
    WHERE section = 'hosting' AND invalidated_at IS NULL
  `;
  return {
    period,
    business: {
      leadCount: leads?.lead_count,
      convertedLeadCount: leads?.converted_lead_count,
    },
    searchCache: searchSnapshot?.payload || null,
    hosting: hostingCache?.payload || null,
  };
}

async function readDelivery(sql, { period, recipient }) {
  const [delivery] = await sql`
    SELECT send_state, sent_at FROM monthly_report_deliveries
    WHERE report_type = 'monthly_operations' AND period_start = ${period.startDate}::date
      AND period_end = ${period.endDate}::date AND recipient = ${recipient}
    LIMIT 1
  `;
  return delivery || null;
}

function deliveryView(delivery, recipientConfigured) {
  return { status: delivery?.send_state === 'sent' ? 'sent' : delivery?.send_state === 'sending' ? 'in_progress' : 'not_sent', sentAt: delivery?.sent_at || null, recipientConfigured };
}

function deliveryKey({ period, recipient }) {
  return crypto.createHash('sha256').update(`monthly_operations:${period.startDate}:${period.endDate}:${recipient}`).digest('hex');
}

async function defaultSendEmail({ env, to, subject, html, text, idempotencyKey }) {
  const providerResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.EMAIL_API_KEY}`, 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ from: 'Navrik <info@navrik.com.au>', to, subject, html, text }),
  });
  if (!providerResponse.ok) throw new Error('Email provider rejected delivery');
  const body = await providerResponse.json().catch(() => ({}));
  return { id: typeof body?.id === 'string' ? body.id : null };
}

async function deliverRecipient({ sql, period, recipient, report, env, sendEmail }) {
  const [claim] = await sql`
    INSERT INTO monthly_report_deliveries (report_type, period_start, period_end, recipient, send_state, payload, attempt_started_at, updated_at)
    VALUES ('monthly_operations', ${period.startDate}::date, ${period.endDate}::date, ${recipient}, 'sending', ${JSON.stringify(report)}::jsonb, NOW(), NOW())
    ON CONFLICT (report_type, period_start, period_end, recipient) DO UPDATE SET
      send_state = 'sending', payload = EXCLUDED.payload, attempt_started_at = NOW(), updated_at = NOW()
    WHERE monthly_report_deliveries.send_state = 'failed'
      OR (monthly_report_deliveries.send_state = 'sending' AND monthly_report_deliveries.attempt_started_at < NOW() - INTERVAL '15 minutes')
    RETURNING send_state, attempt_started_at
  `;
  if (!claim) {
    const existing = await readDelivery(sql, { period, recipient });
    return existing?.send_state === 'sent'
      ? { status: 'already_sent', recipient, sentAt: existing.sent_at }
      : { status: 'in_progress', recipient, sentAt: null };
  }
  const rendered = renderMonthlyReportEmail({ period, report });
  try {
    const provider = await sendEmail({ env, to: recipient, ...rendered, idempotencyKey: deliveryKey({ period, recipient }) });
    await sql`
      UPDATE monthly_report_deliveries SET send_state = 'sent', sent_at = NOW(), provider_message_id = ${provider?.id || null}, updated_at = NOW()
      WHERE report_type = 'monthly_operations' AND period_start = ${period.startDate}::date
        AND period_end = ${period.endDate}::date AND recipient = ${recipient}
    `;
    return { status: 'sent', recipient, sentAt: null };
  } catch (error) {
    await sql`
      UPDATE monthly_report_deliveries SET send_state = 'failed', updated_at = NOW()
      WHERE report_type = 'monthly_operations' AND period_start = ${period.startDate}::date
        AND period_end = ${period.endDate}::date AND recipient = ${recipient} AND send_state <> 'sent'
    `;
    log.error('monthly recipient delivery failed', { recipient, error: error instanceof Error ? error.message : 'unknown' });
    return { status: 'failed', recipient, sentAt: null };
  }
}

export async function deliverMonthlyReport({ sql, period, env = process.env, sendEmail = defaultSendEmail }) {
  const missing = missingDeliveryConfiguration(env);
  if (missing.length) return { status: 'setup_required', missingConfiguration: missing };
  const recipients = approvedRecipients(env);
  const searchRefresh = await refreshMonthlySearchConsoleSnapshot({ sql, period, env });
  const input = await loadReportInput(sql, period, env.REPORTING_TIME_ZONE || 'UTC');
  if (!input.searchCache && searchRefresh.status !== 'ready') input.searchCache = searchRefresh;
  const report = buildMonthlyReport(input);
  const deliveries = [];
  for (const recipient of recipients) deliveries.push(await deliverRecipient({ sql, period, recipient, report, env, sendEmail }));
  const statuses = deliveries.map((delivery) => delivery.status);
  const status = statuses.every((value) => value === 'sent' || value === 'already_sent')
    ? (statuses.every((value) => value === 'already_sent') ? 'already_sent' : 'sent')
    : statuses.some((value) => value === 'failed') ? 'partial_failure' : 'in_progress';
  return { status, period, report, delivery: { status, recipientConfigured: true } };
}

export function createHandler({ verifyAdminToken: verify = verifyAdminToken, getSql = () => neon(databaseUrl()), env = process.env, now = () => new Date(), sendEmail = defaultSendEmail } = {}) {
  return async (event) => {
    const headers = headersFor(event);
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (!['GET', 'POST'].includes(event.httpMethod)) return response(405, headers, { error: 'Method not allowed' });
    try {
      if (!await verify(event)) return response(401, headers, { error: 'Unauthorized' });
      const sql = getSql();
      // A monthly report is decision support, not a live dashboard. Use the
      // last completed calendar month so Search Console's normal processing
      // delay can never make the report look unconfigured on the first days
      // of a new month.
      const timeZone = env.REPORTING_TIME_ZONE || 'UTC';
      const period = monthlyPeriodFor(now(), 'previous', timeZone);
      if (event.httpMethod === 'GET') {
        const input = await loadReportInput(sql, period, timeZone);
        const recipients = approvedRecipients(env);
        const deliveries = recipients ? await Promise.all(recipients.map((recipient) => readDelivery(sql, { period, recipient }))) : [];
        const allSent = deliveries.length === APPROVED_MONTHLY_RECIPIENTS.length && deliveries.every((delivery) => delivery?.send_state === 'sent');
        const anySending = deliveries.some((delivery) => delivery?.send_state === 'sending');
        return response(200, headers, { reportType: 'monthly_operations', period, report: buildMonthlyReport(input), delivery: deliveryView(allSent ? { send_state: 'sent' } : anySending ? { send_state: 'sending' } : null, Boolean(recipients)) });
      }
      const body = parseBody(event.body);
      if (Object.keys(body).length !== 1 || body.action !== 'send_current') return response(400, headers, { error: 'Only send_current is supported' });
      const delivered = await deliverMonthlyReport({ sql, period, env, sendEmail });
      if (delivered.status === 'setup_required') return response(422, headers, { status: 'setup_required', explanation: 'Monthly internal report delivery is not configured yet.', missingConfiguration: delivered.missingConfiguration });
      log.info('monthly internal report delivery completed', { status: delivered.status, periodStart: period.startDate, periodEnd: period.endDate });
      return response(202, headers, { status: delivered.status, period: delivered.period, report: delivered.report, delivery: delivered.delivery });
    } catch (error) {
      if (error instanceof Error && error.message === 'Request body must be valid JSON') return response(400, headers, { error: error.message });
      log.error('monthly report request failed', { error: error instanceof Error ? error.name : 'unknown' });
      return response(502, headers, { error: 'Unable to process monthly internal report' });
    }
  };
}

export const handler = createHandler();
