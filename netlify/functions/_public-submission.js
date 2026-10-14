import { hashSecret } from './_security.js';
import { isIP } from 'node:net';
import { enquiryText as text, SubmissionValidationError, validateEnquiryDetails } from './_enquiry-details.js';
export { SubmissionValidationError } from './_enquiry-details.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ATTEMPTS = 5;

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function validatePublicLead(body, { quote = false, partner = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new SubmissionValidationError('Invalid submission');
  const allowed = new Set([
    'Name', 'Phone', 'Email', 'Message', 'LocationState', 'LocationSuburb', 'DiscoverySource', 'DiscoverySourceDetail',
    ...(quote ? ['Product', 'Type'] : partner ? ['BusinessName', 'EnquiryType'] : ['Surname']),
  ]);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw new SubmissionValidationError('Unknown submission fields');
  if (quote && body.Type !== 'Product Quote Request') throw new SubmissionValidationError('Invalid quote request type');
  if (partner && !['dealer_enquiry', 'fitment_enquiry'].includes(body.EnquiryType)) throw new SubmissionValidationError('Invalid partner enquiry type');
  const lead = {
    Name: text(body.Name, 'Name', { required: true, maxLength: 160 }),
    Surname: quote || partner ? '' : text(body.Surname, 'Surname', { maxLength: 160 }),
    ...(partner ? { BusinessName: text(body.BusinessName, 'BusinessName', { required: true, maxLength: 160 }) } : {}),
    Phone: text(body.Phone, 'Phone', { required: true, maxLength: 50 }),
    Email: text(body.Email, 'Email', { required: true, maxLength: 254 }).toLowerCase(),
    Message: text(body.Message, 'Message', { required: true, maxLength: 4000 }),
    Product: quote ? text(body.Product, 'Product', { required: true, maxLength: 160 }) : '',
    ...(quote ? { Type: 'Product Quote Request' } : {}),
    EnquiryType: quote ? 'product_quote' : partner ? body.EnquiryType : 'general_contact',
    ...validateEnquiryDetails(body),
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
