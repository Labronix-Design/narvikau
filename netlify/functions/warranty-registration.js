import { createHash, randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { verifyAdminToken } from './admin-auth.js';
import { createSubmissionRateLimiter, SubmissionValidationError } from './_public-submission.js';

const WARRANTY_FIELDS = new Set([
  'purchaserName', 'purchaserEmail', 'purchaserPhone', 'productId', 'productName', 'purchaseReference',
  'vehicleMake', 'vehicleModel', 'vehicleYear', 'vehicleRegistration', 'purchaseDate', 'fitmentDate', 'consent',
]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

const log = {
  info: (msg, d = {}) => console.log(JSON.stringify({ level: 'INFO', fn: 'warranty-registration', msg, ...d, ts: new Date().toISOString() })),
  error: (msg, d = {}) => console.error(JSON.stringify({ level: 'ERROR', fn: 'warranty-registration', msg, ...d, ts: new Date().toISOString() })),
};

function defaultGetSql() {
  if (!process.env.NETLIFY_DATABASE_URL) throw new Error('Database configuration is missing');
  return neon(process.env.NETLIFY_DATABASE_URL);
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
  if (result > new Date().toISOString().slice(0, 10)) throw new SubmissionValidationError(`${field} cannot be in the future`);
  return result;
}

function integer(value, field, { minimum, maximum, optional = false }) {
  if (optional && (value === undefined || value === null)) return null;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new SubmissionValidationError(`${field} is invalid`);
  return value;
}

export function validateWarrantyRegistration(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SubmissionValidationError('Invalid warranty registration');
  if (Object.keys(value).some((key) => !WARRANTY_FIELDS.has(key))) throw new SubmissionValidationError('Unknown warranty registration fields');

  const purchaseDate = date(value.purchaseDate, 'purchaseDate');
  const fitmentDate = date(value.fitmentDate, 'fitmentDate');
  if (fitmentDate < purchaseDate) throw new SubmissionValidationError('fitmentDate cannot be before purchaseDate');
  if (value.consent !== true) throw new SubmissionValidationError('consent is required');
  const purchaserEmail = text(value.purchaserEmail, 'purchaserEmail', { required: true, maxLength: 254 }).toLowerCase();
  if (!EMAIL_RE.test(purchaserEmail)) throw new SubmissionValidationError('purchaserEmail is invalid');

  return {
    purchaserName: text(value.purchaserName, 'purchaserName', { required: true, maxLength: 160 }),
    purchaserEmail,
    purchaserPhone: text(value.purchaserPhone, 'purchaserPhone', { required: true, maxLength: 50 }),
    productId: integer(value.productId, 'productId', { minimum: 1, maximum: 2147483647, optional: true }),
    productName: text(value.productName, 'productName', { required: true, maxLength: 160 }),
    purchaseReference: text(value.purchaseReference, 'purchaseReference', { maxLength: 160 }),
    vehicleMake: text(value.vehicleMake, 'vehicleMake', { required: true, maxLength: 80 }),
    vehicleModel: text(value.vehicleModel, 'vehicleModel', { required: true, maxLength: 100 }),
    vehicleYear: integer(value.vehicleYear, 'vehicleYear', { minimum: 1900, maximum: new Date().getUTCFullYear() + 1 }),
    vehicleRegistration: text(value.vehicleRegistration, 'vehicleRegistration', { required: true, maxLength: 32 }),
    purchaseDate,
    fitmentDate,
    consent: true,
  };
}

function submissionHash(registration) {
  return createHash('sha256').update(JSON.stringify(registration)).digest('hex');
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
      if (!await limiter.check({ event, source: 'warranty_registration', email: registration.purchaserEmail })) {
        return { statusCode: 429, headers, body: JSON.stringify({ error: 'Too many registrations. Please try again later.' }) };
      }
    } catch (error) {
      log.error('rate limit unavailable', { error: error instanceof Error ? error.name : 'unknown' });
      return { statusCode: 503, headers, body: JSON.stringify({ error: 'Warranty registration is temporarily unavailable.' }) };
    }

    try {
      sql ||= getSql();
      const hash = submissionHash(registration);
      const [saved] = await sql`
        INSERT INTO warranty_registrations (
          registration_reference, submission_hash, purchaser_name, purchaser_email, purchaser_phone,
          product_id, product_name, purchase_reference, vehicle_make, vehicle_model, vehicle_year,
          vehicle_registration, purchase_date, fitment_date, consent_at
        ) VALUES (
          ${makeReference()}, ${hash}, ${registration.purchaserName}, ${registration.purchaserEmail}, ${registration.purchaserPhone},
          ${registration.productId}, ${registration.productName}, ${registration.purchaseReference || null},
          ${registration.vehicleMake}, ${registration.vehicleModel}, ${registration.vehicleYear}, ${registration.vehicleRegistration},
          ${registration.purchaseDate}, ${registration.fitmentDate}, NOW()
        )
        ON CONFLICT (submission_hash) DO UPDATE SET submission_hash = EXCLUDED.submission_hash
        RETURNING registration_reference, (xmax = 0) AS created
      `;
      if (!saved?.registration_reference) throw new Error('Warranty persistence returned no reference');
      const created = saved.created === true || saved.created === 'true';
      log.info(created ? 'registered' : 'replayed');
      return {
        statusCode: created ? 201 : 200,
        headers,
        body: JSON.stringify({ ok: true, registrationReference: saved.registration_reference, replayed: !created }),
      };
    } catch (error) {
      if (error?.code === '23503') return { statusCode: 422, headers, body: JSON.stringify({ error: 'The selected product is not available for warranty registration.' }) };
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
          id, registration_reference, purchaser_name, purchaser_email, purchaser_phone,
          product_id, product_name, purchase_reference, vehicle_make, vehicle_model, vehicle_year,
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
