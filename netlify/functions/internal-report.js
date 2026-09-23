import { neon } from '@neondatabase/serverless';
import { verifyAdminToken } from './admin-auth.js';

const log = {
  info: (msg, d = {}) => console.log(JSON.stringify({ level: 'INFO', fn: 'internal-report', msg, ...d, ts: new Date().toISOString() })),
  error: (msg, d = {}) => console.error(JSON.stringify({ level: 'ERROR', fn: 'internal-report', msg, ...d, ts: new Date().toISOString() })),
};

function headersFor(event) {
  const headers = {
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    Vary: 'Origin',
  };
  const allowedOrigin = process.env.ADMIN_APP_ORIGIN || 'https://www.navrik.com.au';
  if (event.headers?.origin === allowedOrigin) headers['Access-Control-Allow-Origin'] = allowedOrigin;
  return headers;
}

function response(statusCode, headers, body) { return { statusCode, headers, body: JSON.stringify(body) }; }

function databaseUrl() {
  const url = process.env.NETLIFY_DATABASE_URL;
  if (!url) throw new Error('Database configuration is missing');
  return url;
}

function localParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Johannesburg', weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

export function isScheduledReportTime(date) {
  const parts = localParts(date);
  return (parts.weekday === 'Mon' || parts.weekday === 'Sat') && parts.hour === '06' && parts.minute === '00';
}

export function buildReport({ business, enquiries, search, hosting }) {
  return {
    business,
    enquiries,
    search,
    hosting,
    measurementCoverage: {
      enquiries: enquiries?.status || 'not_measured',
      search: search?.status || 'not_measured',
      hosting: hosting?.status || 'not_measured',
    },
  };
}

function emptySections() {
  return {
    business: { status: 'not_measured', explanation: 'Business metrics have not been cached yet.' },
    enquiries: { status: 'not_measured', explanation: 'Customer enquiries have not been cached yet.' },
    search: { status: 'not_measured', explanation: 'Search Console has not been measured yet.' },
    hosting: { status: 'not_measured', explanation: 'Hosting usage has not been imported yet.' },
  };
}

async function currentReportData(sql) {
  const rows = await sql`
    SELECT section, payload, invalidated_at
    FROM control_centre_cache
    WHERE section = ANY(${['business_overview', 'enquiries', 'search', 'hosting']})
  `;
  const sections = emptySections();
  const reportSections = {
    business_overview: 'business',
    enquiries: 'enquiries',
    search: 'search',
    hosting: 'hosting',
  };
  for (const row of rows) {
    const reportSection = reportSections[row.section];
    if (!row.invalidated_at && reportSection && row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)) {
      sections[reportSection] = row.payload;
    }
  }
  return sections;
}

export async function persistScheduledReport(sql, scheduledFor) {
  if (!isScheduledReportTime(scheduledFor)) return { status: 'ignored', explanation: 'Not a configured reporting time.' };
  const report = buildReport(await currentReportData(sql));
  await sql`
    INSERT INTO internal_report_snapshots (report_type, scheduled_for, payload)
    VALUES ('scheduled_operations', ${scheduledFor.toISOString()}::timestamptz, ${JSON.stringify(report)}::jsonb)
    ON CONFLICT (report_type, scheduled_for) DO NOTHING
  `;
  return { status: 'persisted' };
}

export function createHandler({ verifyAdminToken: verify = verifyAdminToken, getSql = () => neon(databaseUrl()), now = () => new Date() } = {}) {
  return async (event) => {
    const headers = headersFor(event);
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'GET') return response(405, headers, { error: 'Method not allowed' });

    try {
      const authed = await verify(event);
      if (!authed) return response(401, headers, { error: 'Unauthorized' });
      const sql = getSql();
      const reports = await sql`
        SELECT id, report_type, scheduled_for, payload, created_at
        FROM internal_report_snapshots
        ORDER BY scheduled_for DESC
        LIMIT 26
      `;
      return response(200, headers, { reports, cache: { status: reports.length ? 'ready' : 'empty', updatedAt: reports[0]?.created_at || null } });
    } catch (error) {
      log.error('internal report failed', { error: error instanceof Error ? error.name : 'unknown' });
      return response(500, headers, { error: 'Unable to process internal report' });
    }
  };
}

export const handler = createHandler();
