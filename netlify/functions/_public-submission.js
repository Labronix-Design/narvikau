import { hashSecret } from './_security.js';
import { isIP } from 'node:net';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ATTEMPTS = 5;

export class SubmissionValidationError extends Error {}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function text(value, field, { required = false, maxLength }) {
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

export function validatePublicLead(body, { quote = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new SubmissionValidationError('Invalid submission');
  const allowed = quote
    ? new Set(['Name', 'Phone', 'Email', 'Message', 'Product', 'Type'])
    : new Set(['Name', 'Surname', 'Phone', 'Email', 'Message']);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw new SubmissionValidationError('Unknown submission fields');
  if (quote && body.Type !== 'Canopy Quote Request') throw new SubmissionValidationError('Invalid quote request type');
  const lead = {
    Name: text(body.Name, 'Name', { required: true, maxLength: 160 }),
    Surname: quote ? '' : text(body.Surname, 'Surname', { maxLength: 160 }),
    Phone: text(body.Phone, 'Phone', { required: true, maxLength: 50 }),
    Email: text(body.Email, 'Email', { required: true, maxLength: 254 }).toLowerCase(),
    Message: text(body.Message, 'Message', { required: true, maxLength: 4000 }),
    Product: quote ? text(body.Product, 'Product', { required: true, maxLength: 160 }) : '',
    ...(quote ? { Type: 'Canopy Quote Request' } : {}),
  };
  if (!EMAIL_RE.test(lead.Email)) throw new SubmissionValidationError('Email is invalid');
  return lead;
}

function trustedPlatformIp(event) {
  const headers = event?.headers || {};
  const header = (name) => {
    const match = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
    return typeof match?.[1] === 'string' ? match[1].trim() : '';
  };
  // Only Netlify's connection address is trusted. Client-controlled client-ip
  // and proxy-chain headers are deliberately never used as a fallback.
  const address = header('x-nf-client-connection-ip');
  return address && !address.includes(',') && isIP(address) ? address : null;
}

export function submissionRateKeys(event, source, email) {
  const ipAddress = trustedPlatformIp(event);
  if (!ipAddress) return null;
  const normalisedEmail = String(email).trim().toLowerCase();
  return {
    ipKey: hashSecret(`${source}:ip:${ipAddress}`),
    emailKey: hashSecret(`${source}:email:${normalisedEmail}`),
  };
}

export function createSubmissionRateLimiter(sql) {
  return {
    async check({ event, source, email }) {
      const keys = submissionRateKeys(event, source, email);
      if (!keys) throw new Error('Trusted Netlify connection address is required');
      const { ipKey, emailKey } = keys;
      await sql`DELETE FROM public_submission_rate_limits WHERE updated_at < NOW() - INTERVAL '24 hours'`;
      const consume = async (rateKey) => {
        const [attempt] = await sql`
        INSERT INTO public_submission_rate_limits (rate_key, attempts, window_started_at, updated_at)
        VALUES (${rateKey}, 1, NOW(), NOW())
        ON CONFLICT (rate_key) DO UPDATE SET
          attempts = CASE WHEN public_submission_rate_limits.window_started_at < NOW() - INTERVAL '15 minutes' THEN 1 ELSE public_submission_rate_limits.attempts + 1 END,
          window_started_at = CASE WHEN public_submission_rate_limits.window_started_at < NOW() - INTERVAL '15 minutes' THEN NOW() ELSE public_submission_rate_limits.window_started_at END,
          updated_at = NOW()
        RETURNING attempts
        `;
        return Number(attempt?.attempts) <= MAX_ATTEMPTS;
      };
      const [ipAllowed, emailAllowed] = await Promise.all([consume(ipKey), consume(emailKey)]);
      return ipAllowed && emailAllowed;
    },
  };
}
