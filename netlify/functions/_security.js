import crypto from 'crypto';

export function hashSecret(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

export function secureStringEquals(left, right) {
  const leftHash = crypto.createHash('sha256').update(String(left), 'utf8').digest();
  const rightHash = crypto.createHash('sha256').update(String(right), 'utf8').digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

export function getHeader(headers = {}, name) {
  const wanted = name.toLowerCase();
  const match = Object.entries(headers).find(([key]) => key.toLowerCase() === wanted);
  return typeof match?.[1] === 'string' ? match[1] : '';
}

export function requestFingerprint(event) {
  const headers = event?.headers || {};
  const address = getHeader(headers, 'x-nf-client-connection-ip')
    || getHeader(headers, 'client-ip')
    || getHeader(headers, 'x-forwarded-for').split(',')[0].trim()
    || 'unknown';
  return hashSecret(address);
}

export function verifyWebhookSignature({ secret, id, timestamp, signature, rawBody, now = new Date(), maxAgeSeconds = 300 }) {
  if (!secret || !id || !timestamp || !signature || typeof rawBody !== 'string') return false;
  if (!/^\d{10,}$/.test(timestamp)) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(Math.floor(now.getTime() / 1000) - timestampSeconds) > maxAgeSeconds) return false;

  const expected = crypto.createHmac('sha256', secret).update(`${id}.${timestamp}.${rawBody}`, 'utf8').digest();
  const candidates = signature.split(/\s+/).flatMap((part) => {
    const [version, encoded] = part.split(',', 2);
    return version === 'v1' && encoded ? [encoded] : [];
  });
  return candidates.some((candidate) => {
    const provided = Buffer.from(candidate, 'base64');
    return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
  });
}
