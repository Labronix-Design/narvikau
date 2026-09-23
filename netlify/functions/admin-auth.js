import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';
import { getHeader, hashSecret, requestFingerprint, secureStringEquals } from './_security.js';

const SESSION_LIMIT = 500;

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
  Pragma: 'no-cache',
  Expires: '0',
};

function response(statusCode, payload) {
  return { statusCode, headers, body: JSON.stringify(payload) };
}

function defaultConfig() {
  return {
    adminPassword: (process.env.ADMIN_PASSWORD || '').trim(),
    databaseUrl: process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL || '',
  };
}

function createRandomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function createPostgresSessionStore(databaseUrl) {
  const sql = neon(databaseUrl);
  return {
    async cleanup() {
      await sql`DELETE FROM admin_sessions WHERE expires_at <= NOW()`;
      await sql`
        DELETE FROM admin_sessions
        WHERE id IN (SELECT id FROM admin_sessions ORDER BY created_at DESC OFFSET ${SESSION_LIMIT})
      `;
      await sql`DELETE FROM admin_login_attempts WHERE updated_at < NOW() - INTERVAL '24 hours'`;
    },
    async isRateLimited(attemptKey) {
      const [attempt] = await sql`
        SELECT blocked_until > NOW() AS blocked FROM admin_login_attempts
        WHERE attempt_key = ${attemptKey} LIMIT 1
      `;
      return attempt?.blocked === true;
    },
    async recordFailedLogin(attemptKey) {
      await sql`
        INSERT INTO admin_login_attempts (attempt_key, failed_attempts, window_started_at, blocked_until, updated_at)
        VALUES (${attemptKey}, 1, NOW(), NULL, NOW())
        ON CONFLICT (attempt_key) DO UPDATE SET
          failed_attempts = CASE WHEN admin_login_attempts.window_started_at < NOW() - INTERVAL '15 minutes' THEN 1 ELSE admin_login_attempts.failed_attempts + 1 END,
          window_started_at = CASE WHEN admin_login_attempts.window_started_at < NOW() - INTERVAL '15 minutes' THEN NOW() ELSE admin_login_attempts.window_started_at END,
          blocked_until = CASE WHEN (CASE WHEN admin_login_attempts.window_started_at < NOW() - INTERVAL '15 minutes' THEN 1 ELSE admin_login_attempts.failed_attempts + 1 END) >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END,
          updated_at = NOW()
      `;
    },
    async clearFailedLogins(attemptKey) {
      await sql`DELETE FROM admin_login_attempts WHERE attempt_key = ${attemptKey}`;
    },
    async createSession(tokenHash) {
      await sql`INSERT INTO admin_sessions (token_hash, expires_at) VALUES (${tokenHash}, NOW() + INTERVAL '24 hours')`;
    },
    async hasValidSession(tokenHash) {
      const [session] = await sql`
        SELECT id FROM admin_sessions WHERE token_hash = ${tokenHash} AND expires_at > NOW() LIMIT 1
      `;
      return Boolean(session);
    },
  };
}

function parsePassword(body) {
  try {
    const parsed = JSON.parse(body || '{}');
    return typeof parsed.password === 'string' ? parsed.password : '';
  } catch {
    return '';
  }
}

export function createAdminAuthHandler({ getConfig = defaultConfig, store: injectedStore, makeToken = createRandomToken } = {}) {
  return async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed' });

    const config = getConfig();
    if (!config.adminPassword || !config.databaseUrl) return response(503, { error: 'Admin auth not configured' });

    const store = injectedStore || createPostgresSessionStore(config.databaseUrl);
    const attemptKey = requestFingerprint(event);
    try {
      await store.cleanup();
      if (await store.isRateLimited(attemptKey)) return response(429, { error: 'Too many login attempts. Please try again later.' });

      const password = parsePassword(event.body);
      if (!secureStringEquals(password, config.adminPassword)) {
        await store.recordFailedLogin(attemptKey);
        return response(401, { error: 'Invalid credentials' });
      }

      const token = makeToken();
      await store.createSession(hashSecret(token));
      await store.clearFailedLogins(attemptKey);
      return response(200, { token });
    } catch (error) {
      console.error('Admin authentication request failed', error?.name || 'unknown error');
      return response(500, { error: 'Unable to process login' });
    }
  };
}

export function createAdminTokenVerifier({ getConfig = defaultConfig, store: injectedStore } = {}) {
  return async (event) => {
    const config = getConfig();
    if (!config.adminPassword || !config.databaseUrl) return false;
    const token = getHeader(event?.headers, 'authorization').replace(/^Bearer\s+/i, '').trim();
    if (!token) return false;

    try {
      const store = injectedStore || createPostgresSessionStore(config.databaseUrl);
      return await store.hasValidSession(hashSecret(token));
    } catch (error) {
      console.error('Admin token verification failed', error?.name || 'unknown error');
      return false;
    }
  };
}

export const handler = createAdminAuthHandler();
export const verifyAdminToken = createAdminTokenVerifier();
