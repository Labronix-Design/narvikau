import { neon } from '@neondatabase/serverless';
import { verifyAdminToken } from './admin-auth.js';

export const BUSINESS_CACHE_SECTIONS = ['business_overview', 'enquiries'];
const CACHE_SECTIONS = new Set([...BUSINESS_CACHE_SECTIONS, 'search']);
const PROFILE_FIELDS = new Set(['companyName', 'tradingName', 'serviceInformation', 'domains', 'contacts', 'preferences']);
const CONTACT_FIELDS = new Set(['email', 'phone', 'address']);
const PREFERENCE_FIELDS = new Set(['reportingTimezone']);
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const log = {
  info: (msg, d = {}) => console.log(JSON.stringify({ level: 'INFO', fn: 'admin-control-centre', msg, ...d, ts: new Date().toISOString() })),
  error: (msg, d = {}) => console.error(JSON.stringify({ level: 'ERROR', fn: 'admin-control-centre', msg, ...d, ts: new Date().toISOString() })),
};

function headersFor(event) {
  const headers = {
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'private, no-store',
    Pragma: 'no-cache',
    Vary: 'Origin',
  };
  const allowedOrigin = process.env.ADMIN_APP_ORIGIN || 'https://www.navrik.com.au';
  if (event.headers?.origin === allowedOrigin) headers['Access-Control-Allow-Origin'] = allowedOrigin;
  return headers;
}

function response(statusCode, headers, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function databaseUrl() {
  const url = process.env.NETLIFY_DATABASE_URL;
  if (!url) throw new Error('Database configuration is missing');
  return url;
}

function asObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

function asString(value, field, { required = false, maxLength = 500 } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${field} is required`);
    return '';
  }
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new Error(`${field} is required`);
  if (trimmed.length > maxLength) throw new Error(`${field} is too long`);
  return trimmed;
}

function rejectUnknownFields(value, allowed, errorMessage) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(errorMessage);
}

export function validateProfile(value) {
  const profile = asObject(value);
  if (!profile) throw new Error('profile must be an object');
  rejectUnknownFields(profile, PROFILE_FIELDS, 'Unknown profile fields');

  const contacts = asObject(profile.contacts ?? {});
  const preferences = asObject(profile.preferences ?? {});
  rejectUnknownFields(contacts, CONTACT_FIELDS, 'Unknown contact fields');
  rejectUnknownFields(preferences, PREFERENCE_FIELDS, 'Unknown preference fields');
  const domains = profile.domains ?? [];
  if (!Array.isArray(domains) || domains.length > 20 || domains.some((domain) => typeof domain !== 'string' || !DOMAIN_RE.test(domain.trim()))) {
    throw new Error('domains must contain valid domain names');
  }
  const email = asString(contacts.email, 'contacts.email', { maxLength: 254 });
  if (email && !EMAIL_RE.test(email)) throw new Error('contacts.email must be a valid email address');
  const timezone = asString(preferences.reportingTimezone, 'preferences.reportingTimezone', { maxLength: 64 });
  if (timezone && timezone !== 'Africa/Johannesburg') throw new Error('preferences.reportingTimezone must be Africa/Johannesburg');

  return {
    companyName: asString(profile.companyName, 'companyName', { required: true, maxLength: 160 }),
    tradingName: asString(profile.tradingName, 'tradingName', { maxLength: 160 }),
    serviceInformation: asString(profile.serviceInformation, 'serviceInformation', { maxLength: 2000 }),
    domains: domains.map((domain) => domain.trim().toLowerCase()),
    contacts: {
      email,
      phone: asString(contacts.phone, 'contacts.phone', { maxLength: 50 }),
      address: asString(contacts.address, 'contacts.address', { maxLength: 500 }),
    },
    preferences: { reportingTimezone: timezone || 'Africa/Johannesburg' },
  };
}

export function selectInvalidationSections(resource) {
  const map = {
    leads: ['business_overview', 'enquiries'],
    enquiries: ['business_overview', 'enquiries'],
    'google-search': ['search'],
    'search-console': ['search'],
  };
  return map[resource] || [];
}

export async function invalidateControlCentreSections(sql, sections) {
  const unique = [...new Set(sections)].filter((section) => CACHE_SECTIONS.has(section));
  if (!unique.length) return [];
  await sql`
    UPDATE control_centre_cache
    SET invalidated_at = NOW()
    WHERE section = ANY(${unique})
  `;
  return unique;
}

function unavailableData() {
  return {
    business_overview: { status: 'not_measured', explanation: 'Business overview has not been cached yet.' },
    enquiries: { status: 'not_measured', explanation: 'Customer enquiries have not been cached yet.' },
    search: { status: 'not_measured', explanation: 'Search Console has not been measured yet.' },
  };
}

function cacheStatus(rows) {
  if (!rows.length) return { status: 'empty', updatedAt: null };
  const current = rows.filter((row) => !row.invalidated_at);
  if (!current.length) return { status: 'stale', updatedAt: null };
  const latest = current.reduce((previous, row) => (!previous || new Date(row.updated_at) > new Date(previous.updated_at) ? row : previous), null);
  return { status: 'ready', updatedAt: latest.updated_at };
}

function sectionsFor(rows) {
  const bySection = new Map(rows.map((row) => [row.section, row]));
  return Object.fromEntries([...CACHE_SECTIONS].map((section) => {
    const row = bySection.get(section);
    return [section, row && !row.invalidated_at ? 'ready' : row ? 'stale' : 'not_measured'];
  }));
}

async function getReadModel(sql) {
  const rows = await sql`
    SELECT section, payload, updated_at, invalidated_at
    FROM control_centre_cache
    WHERE section = ANY(${[...CACHE_SECTIONS]})
  `;
  const [profile] = await sql`SELECT content, updated_at FROM business_profiles WHERE id = 1`;
  const data = unavailableData();
  for (const row of rows) {
    if (!row.invalidated_at && CACHE_SECTIONS.has(row.section) && asObject(row.payload)) data[row.section] = row.payload;
  }
  return {
    data,
    cache: cacheStatus(rows),
    profile: asObject(profile?.content),
    sections: sectionsFor(rows),
  };
}

function metricInteger(value) {
  const result = Number(value ?? 0);
  return Number.isSafeInteger(result) && result >= 0 ? result : 0;
}

function recommendedActions(metrics) {
  const actions = [];
  if (metrics.newEnquiries > 0) actions.push({ key: 'follow_up_new_enquiries', explanation: `${metrics.newEnquiries} ${metrics.newEnquiries === 1 ? 'new enquiry needs' : 'new enquiries need'} follow-up.` });
  if (!actions.length) actions.push({ key: 'maintain_measurement', explanation: 'No operational action is currently measured as urgent.' });
  return actions;
}

function notMeasuredComparison() {
  return { status: 'not_measured', explanation: 'No measured comparison period is available.' };
}

async function loadBusinessMetrics(sql) {
  const [rows] = await sql`
    SELECT
      COUNT(*)::INTEGER AS enquiry_count,
      COUNT(*) FILTER (WHERE status = 'new')::INTEGER AS new_enquiries,
      COUNT(*) FILTER (WHERE status = 'contacted')::INTEGER AS contacted_enquiries,
      COUNT(*) FILTER (WHERE status = 'quoted')::INTEGER AS quoted_enquiries,
      COUNT(*) FILTER (WHERE status = 'converted')::INTEGER AS converted_enquiries,
      COUNT(*) FILTER (WHERE status = 'closed')::INTEGER AS closed_enquiries
    FROM leads
  `;
  return rows || {};
}

function snapshotHealth(metrics) {
  if (metrics.newEnquiries > 0) return { state: 'attention', label: 'Needs attention', explanation: 'New customer enquiries need follow-up.' };
  return { state: 'ready', label: 'Ready', explanation: 'Recorded operational data is current.' };
}

export function buildBusinessSnapshot(section, row) {
  const metrics = {
    enquiryCount: metricInteger(row?.enquiry_count),
    newEnquiries: metricInteger(row?.new_enquiries),
    contactedEnquiries: metricInteger(row?.contacted_enquiries),
    quotedEnquiries: metricInteger(row?.quoted_enquiries),
    convertedEnquiries: metricInteger(row?.converted_enquiries),
    closedEnquiries: metricInteger(row?.closed_enquiries),
  };
  const conversion = { numerator: metrics.convertedEnquiries, denominator: metrics.enquiryCount };
  const comparison = notMeasuredComparison();
  const health = snapshotHealth(metrics);
  if (section === 'business_overview') return {
    status: 'ready',
    scope: { enquiries: 'All recorded customer enquiries by their recorded status.' },
    enquiryCount: metrics.enquiryCount,
    newEnquiries: metrics.newEnquiries,
    conversion,
    comparison,
    actions: recommendedActions(metrics),
    health,
  };
  if (section === 'enquiries') return {
    status: 'ready',
    scope: { enquiries: 'All recorded customer enquiries by their recorded status.' },
    enquiryCount: metrics.enquiryCount,
    newEnquiries: metrics.newEnquiries,
    contactedEnquiries: metrics.contactedEnquiries,
    quotedEnquiries: metrics.quotedEnquiries,
    convertedEnquiries: metrics.convertedEnquiries,
    closedEnquiries: metrics.closedEnquiries,
    conversion,
    comparison,
    health,
  };
  throw new Error('Unknown business cache section');
}

async function refreshBusinessSection(sql, section) {
  const row = await loadBusinessMetrics(sql);
  const data = buildBusinessSnapshot(section, row);
  const [cached] = await sql`
    INSERT INTO control_centre_cache (section, payload, source, updated_at, invalidated_at)
    VALUES (${section}, ${JSON.stringify(data)}::jsonb, 'database', NOW(), NULL)
    ON CONFLICT (section) DO UPDATE SET
      payload = EXCLUDED.payload,
      source = EXCLUDED.source,
      updated_at = NOW(),
      invalidated_at = NULL
    RETURNING updated_at
  `;
  return { data, cache: { status: 'ready', updatedAt: cached?.updated_at || null } };
}

function parseBody(rawBody) {
  try {
    const body = JSON.parse(rawBody || '{}');
    if (!asObject(body)) throw new Error('Request body must be an object');
    return body;
  } catch {
    throw new Error('Request body must be valid JSON');
  }
}

export function createHandler({ verifyAdminToken: verify = verifyAdminToken, getSql = () => neon(databaseUrl()) } = {}) {
  return async (event) => {
    const headers = headersFor(event);
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (!['GET', 'POST', 'PUT'].includes(event.httpMethod)) return response(405, headers, { error: 'Method not allowed' });

    let authed;
    try {
      authed = await verify(event);
    } catch (error) {
      log.error('admin verification failed', { error: error instanceof Error ? error.name : 'unknown' });
      return response(503, headers, { error: 'Service unavailable' });
    }
    if (!authed) return response(401, headers, { error: 'Unauthorized' });

    try {
      const sql = getSql();
      if (event.httpMethod === 'GET') return response(200, headers, await getReadModel(sql));

      const body = parseBody(event.body);
      if (event.httpMethod === 'PUT') {
        if (Object.keys(body).length !== 1 || !Object.hasOwn(body, 'profile')) return response(400, headers, { error: 'Only profile may be updated' });
        const profile = validateProfile(body.profile);
        const [saved] = await sql`
          WITH saved AS (
            INSERT INTO business_profiles (id, content, updated_at)
            VALUES (1, ${JSON.stringify(profile)}::jsonb, NOW())
            ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()
            RETURNING content, updated_at
          )
          SELECT content, updated_at FROM saved
        `;
        log.info('business profile updated', { invalidatedSections: [] });
        return response(200, headers, { profile: saved?.content || profile, invalidatedSections: [] });
      }

      if (Object.keys(body).length !== 1 || typeof body.section !== 'string') {
        return response(400, headers, { error: 'section must name one refreshable snapshot' });
      }
      if (BUSINESS_CACHE_SECTIONS.includes(body.section)) {
        const refreshed = await refreshBusinessSection(sql, body.section);
        log.info('business snapshot refreshed', { section: body.section });
        return response(200, headers, { section: body.section, ...refreshed });
      }
      if (body.section === 'search') {
        const sections = await invalidateControlCentreSections(sql, ['search']);
        log.info('Google search cache marked stale', { sections });
        return response(202, headers, { invalidatedSections: sections });
      }
      return response(400, headers, { error: 'section must name one refreshable snapshot' });
    } catch (error) {
      if (error instanceof Error && /^(Request body|profile|Unknown|companyName|tradingName|serviceInformation|domains|contacts|preferences)/.test(error.message)) {
        return response(400, headers, { error: error.message });
      }
      log.error('control centre request failed', { error: error instanceof Error ? error.name : 'unknown' });
      return response(500, headers, { error: 'Unable to process the control-centre request' });
    }
  };
}

export const handler = createHandler();
