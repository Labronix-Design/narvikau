import crypto from 'crypto';
import { neon } from '@neondatabase/serverless';
import { verifyAdminToken } from './admin-auth.js';

const BASE_REQUIRED_CONFIGURATION = [
  'GSC_OAUTH_CLIENT_ID',
  'GSC_OAUTH_CLIENT_SECRET',
  'GSC_OAUTH_REDIRECT_URI',
  'GSC_OAUTH_STATE_SECRET',
  'GSC_TOKEN_ENCRYPTION_KEY',
  'GSC_SITE_URL',
];
const ALLOWED_REDIRECT_URIS = new Set([
  'https://navrik.com.au/api/admin-search-console?action=callback',
]);
const ALLOWED_SITE_URLS = new Set(['sc-domain:navrik.com.au']);
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const REFRESH_COOLDOWN_MS = 15 * 60 * 1000;
const MAX_ACTIVE_OAUTH_STATES = 5;
const REFRESH_LEASE_TTL_MS = 5 * 60 * 1000;
const REFRESH_LEASE_PREFIX = 'google_search_console_refresh:';
const GOOGLE_READONLY_SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
].join(' ');

class GoogleAuthorizationRefreshError extends Error {
  constructor(providerCode = null) {
    super('Google authorization refresh failed');
    this.name = 'GoogleAuthorizationRefreshError';
    this.providerCode = providerCode;
  }
}

const log = {
  info: (msg, d = {}) => console.log(JSON.stringify({ level: 'INFO', fn: 'admin-search-console', msg, ...d, ts: new Date().toISOString() })),
  error: (msg, d = {}) => console.error(JSON.stringify({ level: 'ERROR', fn: 'admin-search-console', msg, ...d, ts: new Date().toISOString() })),
};

function headersFor(event) {
  const headers = { 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', Pragma: 'no-cache', Vary: 'Origin' };
  const allowedOrigin = process.env.ADMIN_APP_ORIGIN || 'https://navrik.com.au';
  if (event.headers?.origin === allowedOrigin) headers['Access-Control-Allow-Origin'] = allowedOrigin;
  return headers;
}

function response(statusCode, headers, body) { return { statusCode, headers, body: JSON.stringify(body) }; }

function databaseUrl() {
  const url = process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL;
  if (!url) throw new Error('Database configuration is missing');
  return url;
}

function missingConfiguration(env) {
  return BASE_REQUIRED_CONFIGURATION.filter((name) => !env[name]?.trim());
}

function invalidConfiguration(env) {
  const invalid = [];
  if (env.GSC_OAUTH_REDIRECT_URI && !ALLOWED_REDIRECT_URIS.has(env.GSC_OAUTH_REDIRECT_URI)) invalid.push('GSC_OAUTH_REDIRECT_URI');
  if (env.GSC_SITE_URL && !ALLOWED_SITE_URLS.has(env.GSC_SITE_URL)) invalid.push('GSC_SITE_URL');
  try { encryptionKey(env); } catch { if (env.GSC_TOKEN_ENCRYPTION_KEY) invalid.push('GSC_TOKEN_ENCRYPTION_KEY'); }
  return invalid;
}

function configurationProblem(env) {
  const missing = missingConfiguration(env);
  const invalid = invalidConfiguration(env);
  return missing.length || invalid.length ? { missing, invalid } : null;
}

function setupState(env, explanation = 'Google Search Console is not connected yet.') {
  const problem = configurationProblem(env);
  return {
    status: 'setup_required', explanation,
    ...(problem?.missing.length ? { missingConfiguration: problem.missing } : {}),
    ...(problem?.invalid.length ? { invalidConfiguration: problem.invalid } : {}),
    data: null, cache: { status: 'empty', updatedAt: null },
    integration: { provider: 'google_search_console', ...(ALLOWED_SITE_URLS.has(env.GSC_SITE_URL) ? { siteUrl: env.GSC_SITE_URL } : {}) },
  };
}

function analyticsSetupState(env) {
  if (!env.GA4_PROPERTY_ID?.trim()) {
    return {
      status: 'setup_required',
      explanation: 'Add the Navrik GA4 property ID, then reconnect Google to include website analytics.',
      metrics: null,
      comparison: null,
    };
  }
  return null;
}

function encryptionKey(env) {
  const key = Buffer.from(env.GSC_TOKEN_ENCRYPTION_KEY || '', 'base64');
  if (key.length !== 32) throw new Error('Invalid OAuth encryption key');
  return key;
}

function encrypt(value, env) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(env), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

function decrypt(value, env) {
  const packed = Buffer.from(value, 'base64url');
  if (packed.length < 29) throw new Error('Invalid encrypted OAuth value');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(env), packed.subarray(0, 12));
  decipher.setAuthTag(packed.subarray(12, 28));
  return Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString('utf8');
}

function stateHash(state, env) {
  return crypto.createHmac('sha256', env.GSC_OAUTH_STATE_SECRET).update(state).digest('base64url');
}

export function createOAuthStateRecord({ state, verifier, env, expiresAt }) {
  return { state_hash: stateHash(state, env), verifier_ciphertext: encrypt(verifier, env), expires_at: expiresAt.toISOString(), consumed_at: null };
}

export function validateOAuthStateRecord({ record, state, env, now = new Date() }) {
  if (!record || typeof state !== 'string' || !state) throw new Error('Invalid OAuth state');
  const expected = Buffer.from(stateHash(state, env));
  const actual = Buffer.from(record.state_hash || '');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual) || record.consumed_at) throw new Error('Invalid OAuth state');
  if (!record.expires_at || new Date(record.expires_at).getTime() <= now.getTime()) throw new Error('OAuth state has expired');
  return decrypt(record.verifier_ciphertext, env);
}

function pkceChallenge(verifier) { return crypto.createHash('sha256').update(verifier).digest('base64url'); }
function dateString(date) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
function daysAgo(days) { return dateString(new Date(Date.now() - days * 24 * 60 * 60 * 1000)); }

function authorizationUrl({ env, state, verifier }) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: env.GSC_OAUTH_CLIENT_ID,
    redirect_uri: env.GSC_OAUTH_REDIRECT_URI,
    response_type: 'code',
    scope: GOOGLE_READONLY_SCOPES,
    access_type: 'offline', prompt: 'consent',
    code_challenge: pkceChallenge(verifier), code_challenge_method: 'S256', state,
  }).toString();
  return url.toString();
}

async function consumeOAuthState(sql, { state, env, now }) {
  const hash = stateHash(state, env);
  const [stored] = await sql`
    SELECT state_hash, verifier_ciphertext, expires_at, consumed_at
    FROM gsc_oauth_states WHERE state_hash = ${hash} LIMIT 1
  `;
  const verifier = validateOAuthStateRecord({ record: stored, state, env, now });
  const [claimed] = await sql`
    UPDATE gsc_oauth_states SET consumed_at = NOW()
    WHERE state_hash = ${hash} AND consumed_at IS NULL AND expires_at > NOW()
    RETURNING state_hash
  `;
  if (!claimed) throw new Error('Invalid OAuth state');
  return verifier;
}

async function reserveOAuthState(sql, record) {
  if (typeof sql.transaction !== 'function') throw new Error('Database transaction support is unavailable');
  // A serializable transaction protects the count-and-insert from concurrent
  // serverless invocations. The advisory lock reduces retry contention; a
  // serialization retry guarantees an old statement snapshot cannot overfill
  // the cap after waiting for that lock.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const transactionResults = await sql.transaction((tx) => [
        tx`SELECT pg_advisory_xact_lock(943176)`,
        tx`DELETE FROM gsc_oauth_states WHERE consumed_at IS NOT NULL OR expires_at <= NOW()`,
        tx`
        WITH available AS (
          SELECT COUNT(*)::INTEGER AS count
          FROM gsc_oauth_states
          WHERE consumed_at IS NULL AND expires_at > NOW()
        ), inserted AS (
          INSERT INTO gsc_oauth_states (state_hash, verifier_ciphertext, expires_at)
          SELECT ${record.state_hash}, ${record.verifier_ciphertext}, ${record.expires_at}::timestamptz
          FROM available
          WHERE count < ${MAX_ACTIVE_OAUTH_STATES}
          RETURNING state_hash
        )
        SELECT state_hash FROM inserted
      `,
      ], { isolationLevel: 'Serializable' });
      const rows = transactionResults[2];
      return Boolean(rows?.[0]);
    } catch (error) {
      if (error?.code !== '40001' || attempt === 1) throw error;
    }
  }
  return false;
}

function refreshLeaseSource(randomBytes) {
  return `${REFRESH_LEASE_PREFIX}${randomBytes(16).toString('base64url')}`;
}

function isActiveRefreshLease(cache, now) {
  if (!cache?.source?.startsWith(REFRESH_LEASE_PREFIX) || !cache.invalidated_at) return false;
  const startedAt = new Date(cache.invalidated_at).getTime();
  return Number.isFinite(startedAt) && now.getTime() - startedAt < REFRESH_LEASE_TTL_MS;
}

async function claimSearchRefreshLease(sql, leaseSource) {
  // The cache row is also the durable, reclaimable lease. Keeping the old
  // payload intact means a concurrent admin can still see the last measured
  // result while a single serverless invocation refreshes Google data.
  const [claimed] = await sql`
    INSERT INTO control_centre_cache (section, payload, source, updated_at, invalidated_at)
    VALUES ('search', '{}'::jsonb, ${leaseSource}, NOW(), NOW())
    ON CONFLICT (section) DO UPDATE SET
      source = ${leaseSource},
      invalidated_at = NOW()
    WHERE
      (control_centre_cache.invalidated_at IS NOT NULL
        OR control_centre_cache.updated_at <= NOW() - (${REFRESH_COOLDOWN_MS} * INTERVAL '1 millisecond'))
      AND
      (control_centre_cache.source NOT LIKE ${`${REFRESH_LEASE_PREFIX}%`}
        OR control_centre_cache.invalidated_at IS NULL
        OR control_centre_cache.invalidated_at <= NOW() - (${REFRESH_LEASE_TTL_MS} * INTERVAL '1 millisecond'))
    RETURNING payload, updated_at
  `;
  return claimed || null;
}

async function releaseSearchRefreshLease(sql, leaseSource) {
  // Do not clear a newer claimant's lease after this invocation times out.
  await sql`
    UPDATE control_centre_cache
    SET source = 'google_search_console', invalidated_at = NOW()
    WHERE section = 'search' AND source = ${leaseSource}
  `;
}

async function exchangeCode({ code, verifier, env, fetchImpl }) {
  const providerResponse = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: env.GSC_OAUTH_CLIENT_ID, client_secret: env.GSC_OAUTH_CLIENT_SECRET, redirect_uri: env.GSC_OAUTH_REDIRECT_URI, code_verifier: verifier, grant_type: 'authorization_code' }),
  });
  if (!providerResponse.ok) throw new Error('Google authorization exchange failed');
  const payload = await providerResponse.json();
  if (!payload?.refresh_token || typeof payload.refresh_token !== 'string') throw new Error('Google authorization exchange did not return a refresh token');
  return payload.refresh_token;
}

async function refreshAccessToken(refreshToken, env, fetchImpl) {
  const providerResponse = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GSC_OAUTH_CLIENT_ID, client_secret: env.GSC_OAUTH_CLIENT_SECRET, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });
  if (!providerResponse.ok) {
    let providerCode = null;
    try {
      const providerPayload = await providerResponse.json();
      providerCode = typeof providerPayload?.error === 'string' ? providerPayload.error : null;
    } catch {
      // The provider response body is optional and must never be exposed.
    }
    throw new GoogleAuthorizationRefreshError(providerCode);
  }
  const payload = await providerResponse.json();
  if (!payload?.access_token || typeof payload.access_token !== 'string') throw new Error('Google authorization refresh failed');
  return payload.access_token;
}

async function queryAnalytics({ accessToken, siteUrl, startDate, endDate, dimensions = [], rowLimit = 1 }, fetchImpl) {
  const providerResponse = await fetchImpl(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ startDate, endDate, dimensions, rowLimit }),
  });
  if (!providerResponse.ok) throw new Error('Google Search Console query failed');
  return providerResponse.json();
}

async function queryWebsiteAnalytics({ accessToken, propertyId, startDate, endDate }, fetchImpl) {
  const providerResponse = await fetchImpl(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [
        { startDate, endDate },
        { startDate: daysAgo(60), endDate: daysAgo(33) },
      ],
      metrics: [
        { name: 'activeUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
        { name: 'keyEvents' },
      ],
    }),
  });
  if (!providerResponse.ok) throw new Error('Google Analytics query failed');
  return providerResponse.json();
}

function metrics(payload) {
  const row = payload?.rows?.[0] || {};
  return { clicks: Number(row.clicks || 0), impressions: Number(row.impressions || 0), ctr: Number(row.ctr || 0), averagePosition: Number(row.position || 0) };
}

function dimensionRows(payload, key) {
  return (payload?.rows || []).map((row) => ({ [key]: String(row.keys?.[0] || ''), clicks: Number(row.clicks || 0), impressions: Number(row.impressions || 0), ctr: Number(row.ctr || 0), averagePosition: Number(row.position || 0) })).filter((row) => row[key]);
}

function analyticsMetrics(row) {
  const values = row?.metricValues || [];
  return {
    activeUsers: Number(values[0]?.value || 0),
    sessions: Number(values[1]?.value || 0),
    pageViews: Number(values[2]?.value || 0),
    keyEvents: Number(values[3]?.value || 0),
  };
}

async function refreshWebsiteAnalytics({ accessToken, startDate, endDate, env, fetchImpl }) {
  const setup = analyticsSetupState(env);
  if (setup) return setup;
  try {
    const payload = await queryWebsiteAnalytics({ accessToken, propertyId: env.GA4_PROPERTY_ID.trim(), startDate, endDate }, fetchImpl);
    return {
      status: 'ready',
      period: { startDate, endDate },
      metrics: analyticsMetrics(payload?.rows?.[0]),
      comparison: analyticsMetrics(payload?.rows?.[1]),
    };
  } catch {
    // A prior Search Console-only grant must not make measured search data unavailable.
    // The administrator can reconnect once to grant Google Analytics read-only access.
    return {
      status: 'not_measured',
      explanation: 'Reconnect Google with Analytics viewer access before website traffic can be measured.',
      metrics: null,
      comparison: null,
    };
  }
}

async function refreshFromGoogle({ refreshToken, env, fetchImpl }) {
  const endDate = daysAgo(3); const currentStartDate = daysAgo(30); const previousStartDate = daysAgo(60); const previousEndDate = daysAgo(33);
  const accessToken = await refreshAccessToken(refreshToken, env, fetchImpl);
  const [current, previous, queries, pages] = await Promise.all([
    queryAnalytics({ accessToken, siteUrl: env.GSC_SITE_URL, startDate: currentStartDate, endDate }, fetchImpl),
    queryAnalytics({ accessToken, siteUrl: env.GSC_SITE_URL, startDate: previousStartDate, endDate: previousEndDate }, fetchImpl),
    queryAnalytics({ accessToken, siteUrl: env.GSC_SITE_URL, startDate: currentStartDate, endDate, dimensions: ['query'], rowLimit: 25 }, fetchImpl),
    queryAnalytics({ accessToken, siteUrl: env.GSC_SITE_URL, startDate: currentStartDate, endDate, dimensions: ['page'], rowLimit: 25 }, fetchImpl),
  ]);
  const websiteAnalytics = await refreshWebsiteAnalytics({ accessToken, startDate: currentStartDate, endDate, env, fetchImpl });
  return { status: 'ready', period: { startDate: currentStartDate, endDate }, metrics: metrics(current), comparison: metrics(previous), topQueries: dimensionRows(queries, 'query'), topPages: dimensionRows(pages, 'page'), opportunities: [], websiteAnalytics };
}

function previousComparablePeriod(period) {
  const start = new Date(`${period.startDate}T00:00:00.000Z`);
  const end = new Date(`${period.endDate}T00:00:00.000Z`);
  const durationDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const previousEnd = new Date(start.getTime() - 86_400_000);
  const previousStart = new Date(previousEnd.getTime() - (durationDays - 1) * 86_400_000);
  return { startDate: previousStart.toISOString().slice(0, 10), endDate: previousEnd.toISOString().slice(0, 10) };
}

async function refreshExactPeriodFromGoogle({ refreshToken, period, env, fetchImpl }) {
  const accessToken = await refreshAccessToken(refreshToken, env, fetchImpl);
  const comparisonPeriod = previousComparablePeriod(period);
  const [current, previous, queries, pages] = await Promise.all([
    queryAnalytics({ accessToken, siteUrl: env.GSC_SITE_URL, startDate: period.startDate, endDate: period.endDate }, fetchImpl),
    queryAnalytics({ accessToken, siteUrl: env.GSC_SITE_URL, startDate: comparisonPeriod.startDate, endDate: comparisonPeriod.endDate }, fetchImpl),
    queryAnalytics({ accessToken, siteUrl: env.GSC_SITE_URL, startDate: period.startDate, endDate: period.endDate, dimensions: ['query'], rowLimit: 25 }, fetchImpl),
    queryAnalytics({ accessToken, siteUrl: env.GSC_SITE_URL, startDate: period.startDate, endDate: period.endDate, dimensions: ['page'], rowLimit: 25 }, fetchImpl),
  ]);
  const websiteAnalytics = await refreshWebsiteAnalytics({ accessToken, startDate: period.startDate, endDate: period.endDate, env, fetchImpl });
  return { status: 'ready', period: { startDate: period.startDate, endDate: period.endDate }, metrics: metrics(current), comparison: metrics(previous), topQueries: dimensionRows(queries, 'query'), topPages: dimensionRows(pages, 'page'), opportunities: [], websiteAnalytics };
}

export async function refreshMonthlySearchConsoleSnapshot({ sql, period, env = process.env, fetchImpl = fetch }) {
  const problem = configurationProblem(env);
  if (problem) return {
    status: 'setup_required',
    explanation: 'Google Search Console is not configured for monthly reporting yet.',
    ...(problem.missing.length ? { missingConfiguration: problem.missing } : {}),
    ...(problem.invalid.length ? { invalidConfiguration: problem.invalid } : {}),
  };
  const [cached] = await sql`
    SELECT payload FROM search_console_monthly_snapshots
    WHERE period_start = ${period.startDate}::date AND period_end = ${period.endDate}::date
    LIMIT 1
  `;
  if (cached?.payload?.status === 'ready'
    && cached.payload.period?.startDate === period.startDate
    && cached.payload.period?.endDate === period.endDate) return cached.payload;
  const [grant] = await sql`SELECT refresh_token_ciphertext FROM gsc_oauth_grants WHERE id = 1`;
  if (!grant?.refresh_token_ciphertext) return { status: 'not_measured', explanation: 'Connect a Google account with Search Console access before monthly reporting.' };
  const payload = await refreshExactPeriodFromGoogle({ refreshToken: decrypt(grant.refresh_token_ciphertext, env), period, env, fetchImpl });
  await sql`
    INSERT INTO search_console_monthly_snapshots (period_start, period_end, payload, source, updated_at)
    VALUES (${period.startDate}::date, ${period.endDate}::date, ${JSON.stringify(payload)}::jsonb, 'google_search_console', NOW())
    ON CONFLICT (period_start, period_end) DO UPDATE SET payload = EXCLUDED.payload, source = EXCLUDED.source, updated_at = NOW()
  `;
  return payload;
}

function parseBody(raw) {
  try { const body = JSON.parse(raw || '{}'); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(); return body; } catch { throw new Error('Request body must be valid JSON'); }
}

async function authenticated(event, verify) { return verify(event); }

export function createHandler({ verifyAdminToken: verify = verifyAdminToken, getSql = () => neon(databaseUrl()), env = process.env, fetchImpl = fetch, now = () => new Date(), randomBytes = crypto.randomBytes } = {}) {
  return async (event) => {
    const headers = headersFor(event);
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (!['GET', 'POST'].includes(event.httpMethod)) return response(405, headers, { error: 'Method not allowed' });
    const action = event.queryStringParameters?.action || '';
    const problem = configurationProblem(env);

    try {
      if (event.httpMethod === 'GET' && action === 'callback') {
        if (problem) return response(200, headers, setupState(env));
        const { code, state, error } = event.queryStringParameters || {};
        if (error || !code || !state) return response(400, headers, { error: 'Google authorization was not completed' });
        const sql = getSql();
        const verifier = await consumeOAuthState(sql, { state, env, now: now() });
        const refreshToken = await exchangeCode({ code, verifier, env, fetchImpl });
        await sql`
          INSERT INTO gsc_oauth_grants (id, refresh_token_ciphertext, updated_at)
          VALUES (1, ${encrypt(refreshToken, env)}, NOW())
          ON CONFLICT (id) DO UPDATE SET refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext, updated_at = NOW()
        `;
        log.info('Google Search Console connected', { siteUrl: env.GSC_SITE_URL });
        return { statusCode: 302, headers: { ...headers, Location: 'https://navrik.com.au/admin/search-visibility?google=connected' }, body: '' };
      }

      const authed = await authenticated(event, verify);
      if (!authed) return response(401, headers, { error: 'Unauthorized' });
      if (problem) return response(200, headers, setupState(env));
      const sql = getSql();

      if (event.httpMethod === 'GET' && action === 'connect') {
        const state = randomBytes(32).toString('base64url');
        const verifier = randomBytes(48).toString('base64url');
        const expiresAt = new Date(now().getTime() + OAUTH_STATE_TTL_MS);
        const record = createOAuthStateRecord({ state, verifier, env, expiresAt });
        if (!await reserveOAuthState(sql, record)) {
          return response(429, headers, { error: 'A Google connection is already in progress. Please try again shortly.' });
        }
        return response(200, headers, { status: 'connect', authorizationUrl: authorizationUrl({ env, state, verifier }), integration: { provider: 'google_search_console', siteUrl: env.GSC_SITE_URL } });
      }

      if (event.httpMethod === 'GET' && action) return response(400, headers, { error: 'Unknown action' });
      if (event.httpMethod === 'GET') {
        const [grant] = await sql`SELECT id FROM gsc_oauth_grants WHERE id = 1`;
        if (!grant) return response(200, headers, setupState(env, 'Connect a Google account with Search Console access to continue.'));
        const [cache] = await sql`SELECT payload, updated_at, invalidated_at, source FROM control_centre_cache WHERE section = 'search'`;
        if (isActiveRefreshLease(cache, now())) {
          return response(200, headers, {
            status: 'ready', data: cache.payload,
            cache: { status: 'stale', updatedAt: cache.updated_at || null },
            refresh: { status: 'in_progress', explanation: 'Google data is refreshing. The last measured result remains available.' },
            integration: { provider: 'google_search_console', siteUrl: env.GSC_SITE_URL },
          });
        }
        if (!cache || cache.invalidated_at) return response(200, headers, { status: 'not_measured', explanation: 'Search Console data has not been refreshed yet.', data: null, cache: { status: cache ? 'stale' : 'empty', updatedAt: null }, integration: { provider: 'google_search_console', siteUrl: env.GSC_SITE_URL } });
        return response(200, headers, { status: 'ready', data: cache.payload, cache: { status: 'ready', updatedAt: cache.updated_at }, integration: { provider: 'google_search_console', siteUrl: env.GSC_SITE_URL } });
      }

      const body = parseBody(event.body);
      if (Object.keys(body).length !== 1 || body.action !== 'refresh') return response(400, headers, { error: 'Only refresh is supported' });
      const [grant] = await sql`SELECT refresh_token_ciphertext FROM gsc_oauth_grants WHERE id = 1`;
      if (!grant?.refresh_token_ciphertext) return response(422, headers, setupState(env, 'Connect a Google account with Search Console access before refreshing.'));
      const [existingCache] = await sql`
        SELECT payload, updated_at, invalidated_at, source FROM control_centre_cache
        WHERE section = 'search'
        LIMIT 1
      `;
      const refreshedAt = existingCache?.updated_at ? new Date(existingCache.updated_at).getTime() : NaN;
      if (existingCache?.payload && !existingCache.invalidated_at && Number.isFinite(refreshedAt) && now().getTime() - refreshedAt < REFRESH_COOLDOWN_MS) {
        return response(200, headers, { status: 'ready', data: existingCache.payload, cache: { status: 'ready', updatedAt: existingCache.updated_at }, refresh: { status: 'cooldown', explanation: 'Data was refreshed recently and remains server-cached.' } });
      }
      const leaseSource = refreshLeaseSource(randomBytes);
      const lease = await claimSearchRefreshLease(sql, leaseSource);
      if (!lease) {
        const [currentCache] = await sql`
          SELECT payload, updated_at, invalidated_at, source FROM control_centre_cache
          WHERE section = 'search'
          LIMIT 1
        `;
        if (isActiveRefreshLease(currentCache, now())) {
          return response(202, headers, {
            status: 'not_measured', data: currentCache.payload || null,
            cache: { status: currentCache.payload ? 'stale' : 'empty', updatedAt: currentCache.updated_at || null },
            refresh: { status: 'in_progress', explanation: 'Another administrator is refreshing Google data. The last cached result remains available.' },
          });
        }
        return response(202, headers, {
          status: 'not_measured', data: currentCache?.payload || null,
          cache: { status: currentCache?.payload ? 'stale' : 'empty', updatedAt: currentCache?.updated_at || null },
          refresh: { status: 'in_progress', explanation: 'Google data refresh is being reserved. Please try again shortly.' },
        });
      }
      let payload;
      let cache;
      try {
        payload = await refreshFromGoogle({ refreshToken: decrypt(grant.refresh_token_ciphertext, env), env, fetchImpl });
        [cache] = await sql`
          UPDATE control_centre_cache
          SET payload = ${JSON.stringify(payload)}::jsonb,
              source = 'google_search_console',
              updated_at = NOW(),
              invalidated_at = NULL
          WHERE section = 'search' AND source = ${leaseSource}
          RETURNING updated_at
        `;
      } catch (error) {
        try { await releaseSearchRefreshLease(sql, leaseSource); } catch (releaseError) {
          log.error('Search Console refresh lease release failed', { error: releaseError instanceof Error ? releaseError.message : 'unknown' });
        }
        if (error instanceof GoogleAuthorizationRefreshError && error.providerCode === 'invalid_grant') {
          // Google has confirmed this persisted grant is no longer valid. Remove
          // only that unusable encrypted token so the next authenticated view
          // offers a clean OAuth reconnect rather than retrying a known 502.
          await sql`DELETE FROM gsc_oauth_grants WHERE id = 1`;
          return response(200, headers, setupState(env, 'Reconnect Google to renew access before Search Console data can be refreshed.'));
        }
        throw error;
      }
      if (!cache) {
        return response(202, headers, {
          status: 'not_measured', data: null,
          cache: { status: 'stale', updatedAt: null },
          refresh: { status: 'in_progress', explanation: 'A newer Google data refresh is in progress.' },
        });
      }
      log.info('Search Console cache refreshed', { siteUrl: env.GSC_SITE_URL });
      return response(200, headers, { status: 'ready', data: payload, cache: { status: 'ready', updatedAt: cache?.updated_at || null } });
    } catch (error) {
      if (error instanceof Error && ['Invalid OAuth state', 'OAuth state has expired', 'Google authorization was not completed'].includes(error.message)) return response(400, headers, { error: 'Google authorization could not be verified' });
      if (error instanceof Error && error.message === 'Request body must be valid JSON') return response(400, headers, { error: error.message });
      log.error('Search Console request failed', { error: error instanceof Error ? error.message : 'unknown' });
      return response(502, headers, { error: 'Unable to process Search Console data' });
    }
  };
}

export const handler = createHandler();
