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
};

function json(body, status) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

function matchesDeclaredImageType(buffer, contentType) {
  if (contentType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (contentType === 'image/png') {
    return buffer.length >= 8
      && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (contentType === 'image/webp') {
    return buffer.length >= 12
      && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

export function createAdminUploadHandler({
  verifyToken = verifyAdminToken,
  getImageStore = getStore,
  createKey = () => `${Date.now()}-${crypto.randomUUID()}`,
} = {}) {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response('', { status: 200, headers: CORS });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const authed = await verifyToken({ headers: Object.fromEntries(req.headers.entries()) });
    if (!authed) return json({ error: 'Unauthorized' }, 401);

    try {
      const { filename, contentType, dataBase64 } = await req.json();

      const ext = ALLOWED_TYPES[contentType];
      if (!ext) {
        return json({ error: 'Unsupported image type. Use JPEG, PNG, or WebP.' }, 400);
      }
      if (typeof dataBase64 !== 'string' || !dataBase64) {
        return json({ error: 'No image data provided.' }, 400);
      }

      const buffer = Buffer.from(dataBase64, 'base64');
      if (buffer.length > MAX_BYTES) {
        return json({ error: 'Image must be under 4MB.' }, 413);
      }
      if (!matchesDeclaredImageType(buffer, contentType)) {
        return json({ error: 'Image data does not match the selected image type.' }, 400);
      }

      const key = `${createKey()}.${ext}`;
      const store = getImageStore('product-images');
      await store.set(key, buffer, { metadata: { contentType, filename: filename || key } });

      return json({ url: `/uploads/${key}` }, 201);
    } catch (err) {
      console.error('admin-upload error:', err);
      return json({ error: 'Unable to upload image' }, 500);
    }
  };
}

export default createAdminUploadHandler();
