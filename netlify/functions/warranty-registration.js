import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { verifyAdminToken } from './admin-auth.js';
import { createSubmissionRateLimiter, SubmissionValidationError } from './_public-submission.js';
import { hashSecret } from './_security.js';

const WARRANTY_FIELDS = new Set([
  'token',
  'vehicleMake', 'vehicleModel', 'vehicleYear', 'vehicleRegistration',
  'purchaseDate', 'fitmentDate', 'consent',
]);
const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

const log = {
  info: (msg, d = {}) => console.log(JSON.stringify({ level: 'INFO', fn: 'warranty-registration', msg, ...d, ts: new Date().toISOString() })),
  error: (msg, d = {}) => console.error(JSON.stringify({ level: 'ERROR', fn: 'warranty-registration', msg, ...d, ts: new Date().toISOString() })),
};

function databaseUrl() {
  const url = process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL;
  if (!url) throw new Error('Database configuration is missing');
  return url;
}

function defaultGetSql() {
  return neon(databaseUrl());
}

function parseObject(rawBody) {
  try {
    const body = JSON.parse(rawBody || '{}');
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid');
    return body;
  } catch {
    throw new SubmissionValidationError('Invalid warranty registration');
  }
}

function text(value, field, { required = false, maxLength = 160 } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new SubmissionValidationError(`${field} is required`);
    return '';
  }
  if (typeof value !== 'string') throw new SubmissionValidationError(`${field} must be text`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new SubmissionValidationError(`${field} is required`);
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) throw new SubmissionValidationError(`${field} contains unsupported characters`);
  if (trimmed.length > maxLength) throw new SubmissionValidationError(`${field} is too long`);
  return trimmed;
}

function date(value, field) {
  const result = text(value, field, { required: true, maxLength: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new SubmissionValidationError(`${field} must be a date`);
  const parsed = new Date(`${result}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) throw new SubmissionValidationError(`${field} must be a date`);
  const today = new Date().toISOString().slice(0, 10);
  if (result > today) throw new SubmissionValidationError(`${field} cannot be in the future`);
  return result;
}

function integer(value, field, { minimum, maximum }) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new SubmissionValidationError(`${field} is invalid`);
  return value;
}

export function validateWarrantyRegistration(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SubmissionValidationError('Invalid warranty registration');
  const unknown = Object.keys(value).filter((key) => !WARRANTY_FIELDS.has(key));
  if (unknown.length) throw new SubmissionValidationError('Unknown warranty registration fields');

  const purchaseDate = date(value.purchaseDate, 'purchaseDate');
  const fitmentDate = date(value.fitmentDate, 'fitmentDate');
  if (fitmentDate < purchaseDate) throw new SubmissionValidationError('fitmentDate cannot be before purchaseDate');
  const currentYear = new Date().getUTCFullYear() + 1;

  if (value.consent !== true) throw new SubmissionValidationError('consent is required');
  return {
    token: (() => {
      const token = text(value.token, 'token', { required: true, maxLength: 128 });
      if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) throw new SubmissionValidationError('token is invalid');
      return token;
    })(),
    vehicleMake: text(value.vehicleMake, 'vehicleMake', { required: true, maxLength: 80 }),
    vehicleModel: text(value.vehicleModel, 'vehicleModel', { required: true, maxLength: 100 }),
    vehicleYear: integer(value.vehicleYear, 'vehicleYear', { minimum: 1900, maximum: currentYear }),
    vehicleRegistration: text(value.vehicleRegistration, 'vehicleRegistration', { required: true, maxLength: 32 }),
    purchaseDate,
    fitmentDate,
    consent: true,
  };
}

export function createWarrantyRegistrationHandler({ getSql = defaultGetSql, rateLimiter, makeReference = () => `WTY-${randomUUID()}` } = {}) {
  return async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    let registration;
    try {
      registration = validateWarrantyRegistration(parseObject(event.body));
    } catch {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Check the warranty registration details and try again.' }) };
    }

    let sql;
    try {
      sql = rateLimiter ? null : getSql();
      const limiter = rateLimiter || createSubmissionRateLimiter(sql);
      const allowed = await limiter.check({ event, source: 'warranty_registration', email: hashSecret(registration.token) });
      if (!allowed) return { statusCode: 429, headers, body: JSON.stringify({ error: 'Too many registrations. Please try again later.' }) };
    } catch (error) {
      log.error('rate limit unavailable', { error: error instanceof Error ? error.name : 'unknown' });
      return { statusCode: 503, headers, body: JSON.stringify({ error: 'Warranty registration is temporarily unavailable.' }) };
    }

    try {
      sql ||= getSql();
      const [created] = await sql`
        WITH claimed_token AS (
          UPDATE warranty_registration_tokens
          SET used_at = NOW()
          WHERE token_hash = ${hashSecret(registration.token)} AND used_at IS NULL
          RETURNING order_id
        ), order_data AS (
          SELECT
            claimed_token.order_id,
            o.product_label,
            CONCAT_WS(' ', c.first_name, c.last_name) AS purchaser_name,
            c.email AS purchaser_email,
            c.phone AS purchaser_phone
          FROM claimed_token
          JOIN orders o ON o.id = claimed_token.order_id
          JOIN customers c ON c.id = o.customer_id
        ), registered AS (
          INSERT INTO warranty_registrations (
            registration_reference, order_id, purchaser_name, purchaser_email, purchaser_phone,
            product_name, vehicle_make, vehicle_model, vehicle_year, vehicle_registration,
            purchase_date, fitment_date, consent_at
          )
          SELECT
            ${makeReference()}, order_id, purchaser_name, purchaser_email, purchaser_phone,
            product_label, ${registration.vehicleMake}, ${registration.vehicleModel}, ${registration.vehicleYear}, ${registration.vehicleRegistration},
            ${registration.purchaseDate}, ${registration.fitmentDate}, NOW()
          FROM order_data
          RETURNING registration_reference
        )
        SELECT registration_reference FROM registered
      `;
      if (!created) return { statusCode: 400, headers, body: JSON.stringify({ error: 'This registration link is not valid or has already been used.' }) };
      log.info('registered');
      return { statusCode: 201, headers, body: JSON.stringify({ ok: true, registrationReference: created.registration_reference }) };
    } catch (error) {
      if (error?.code === '23505') return { statusCode: 400, headers, body: JSON.stringify({ error: 'This registration link is not valid or has already been used.' }) };
      log.error('persistence failed', { error: error instanceof Error ? error.name : 'unknown' });
      return { statusCode: 503, headers, body: JSON.stringify({ error: 'Warranty registration is temporarily unavailable.' }) };
    }
  };
}

function boundedInteger(value, fallback, maximum) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return fallback;
  const result = Number(value);
  return Number.isSafeInteger(result) ? Math.min(result, maximum) : fallback;
}

export function createAdminWarrantyHandler({ verifyAdminToken: verify = verifyAdminToken, getSql = defaultGetSql } = {}) {
  return async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    try {
      if (!await verify(event)) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    } catch (error) {
      log.error('admin verification failed', { error: error instanceof Error ? error.name : 'unknown' });
      return { statusCode: 503, headers, body: JSON.stringify({ error: 'Service unavailable' }) };
    }

    try {
      const params = event.queryStringParameters || {};
      const limit = boundedInteger(params.limit, 50, 100);
      const offset = boundedInteger(params.offset, 0, 10000);
      const rows = await getSql()`
        SELECT
          id, registration_reference, order_id, purchaser_name, purchaser_email, purchaser_phone,
          product_name, order_reference, vehicle_make, vehicle_model, vehicle_year,
          vehicle_registration, purchase_date, fitment_date, consent_at, registered_at
        FROM warranty_registrations
        ORDER BY registered_at DESC, id DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      return { statusCode: 200, headers, body: JSON.stringify({ items: rows }) };
    } catch (error) {
      log.error('admin read failed', { error: error instanceof Error ? error.name : 'unknown' });
      return { statusCode: 503, headers, body: JSON.stringify({ error: 'Warranty registrations are temporarily unavailable.' }) };
    }
  };
}

export const handler = createWarrantyRegistrationHandler();
