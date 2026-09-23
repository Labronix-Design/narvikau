import { neon } from '@neondatabase/serverless';
import { verifyAdminToken } from './admin-auth.js';

const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
  Pragma: 'no-cache',
};

const log = {
  info: (msg, d = {}) => console.log(JSON.stringify({ level: 'INFO', fn: 'admin-analytics', msg, ...d, ts: new Date().toISOString() })),
  error: (msg, d = {}) => console.error(JSON.stringify({ level: 'ERROR', fn: 'admin-analytics', msg, ...d, ts: new Date().toISOString() })),
};

function databaseUrl() {
  const url = process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL;
  if (!url) throw new Error('Database configuration is missing');
  return url;
}

function snapshotResponse(cache) {
  if (!cache || cache.invalidated_at || !cache.payload || typeof cache.payload !== 'object' || Array.isArray(cache.payload)) {
    return {
      status: 'not_measured',
      explanation: 'Enquiry analytics is awaiting an authenticated refresh.',
      data: null,
      cache: { status: cache ? 'stale' : 'empty', updatedAt: cache?.updated_at || null },
    };
  }
  return { status: 'ready', data: cache.payload, cache: { status: 'ready', updatedAt: cache.updated_at || null } };
}

export function createHandler({ verifyAdminToken: verify = verifyAdminToken, getSql = () => neon(databaseUrl()) } = {}) {
  return async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    try {
      if (!await verify(event)) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    } catch (error) {
      log.error('admin verification failed', { error: error instanceof Error ? error.message : 'unknown' });
      return { statusCode: 503, headers, body: JSON.stringify({ error: 'Service unavailable' }) };
    }

    const type = (event.queryStringParameters || {}).type || 'enquiries';

    try {
      const sql = getSql();
    const snapshotSection = type === 'enquiries' ? 'enquiries' : type === 'overview' ? 'business_overview' : null;
    if (snapshotSection) {
      const [cache] = await sql`
        SELECT payload, updated_at, invalidated_at
        FROM control_centre_cache
        WHERE section = ${snapshotSection}
        LIMIT 1
      `;
      return { statusCode: 200, headers, body: JSON.stringify(snapshotResponse(cache)) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown analytics type' }) };
    } catch (error) {
      log.error('analytics snapshot read failed', { error: error instanceof Error ? error.name : 'unknown' });
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Unable to load enquiry analytics' }) };
    }
  };
}

export const handler = createHandler();
