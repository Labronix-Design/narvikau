import { getStore } from '@netlify/blobs';
import crypto from 'crypto';
import { verifyAdminToken } from './admin-auth.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const MAX_BYTES = 4 * 1024 * 1024; // 4MB decoded
const ALLOWED_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

function json(body, status) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 200, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authed = await verifyAdminToken({ headers: Object.fromEntries(req.headers.entries()) });
  if (!authed) return json({ error: 'Unauthorized' }, 401);

  try {
    const { filename, contentType, dataBase64 } = await req.json();

    const ext = ALLOWED_TYPES[contentType];
    if (!ext) {
      return json({ error: 'Unsupported image type. Use JPEG, PNG, WebP, GIF, or SVG.' }, 400);
    }
    if (!dataBase64) {
      return json({ error: 'No image data provided.' }, 400);
    }

    const buffer = Buffer.from(dataBase64, 'base64');
    if (buffer.length > MAX_BYTES) {
      return json({ error: 'Image must be under 4MB.' }, 413);
    }

    const key = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const store = getStore('product-images');
    await store.set(key, buffer, { metadata: { contentType, filename: filename || key } });

    return json({ url: `/uploads/${key}` }, 201);
  } catch (err) {
    console.error('admin-upload error:', err);
    return json({ error: err.message }, 500);
  }
};
