import { getStore } from '@netlify/blobs';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function localUploadFallbackUrl(requestUrl, key) {
  const url = new URL(requestUrl);
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return null;
  return `https://navrik.com.au/uploads/${encodeURIComponent(key)}`;
}

function contentTypeFrom(value) {
  return (value || '').split(';', 1)[0].trim().toLowerCase();
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

function imageResponse(data, contentType) {
  return new Response(data, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function notFound() {
  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function createServeUploadHandler({
  getImageStore = getStore,
  fetchImage = fetch,
  getFallbackUrl = localUploadFallbackUrl,
} = {}) {
  return async (req) => {
    if (req.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let key;
    try {
      key = decodeURIComponent(new URL(req.url).pathname.split('/').pop() || '');
    } catch (err) {
      console.error('serve-upload invalid request:', err);
      return notFound();
    }
    if (!key) {
      return new Response(JSON.stringify({ error: 'Missing image key' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      const store = getImageStore('product-images');
      const result = await store.getWithMetadata(key, { type: 'arrayBuffer' });

      if (!result) {
        const fallbackUrl = getFallbackUrl(req.url, key);
        if (fallbackUrl) {
          const liveResponse = await fetchImage(fallbackUrl);
          const contentType = contentTypeFrom(liveResponse.headers.get('content-type'));
          const data = Buffer.from(await liveResponse.arrayBuffer());
          if (liveResponse.ok && ALLOWED_IMAGE_TYPES.has(contentType) && matchesDeclaredImageType(data, contentType)) {
            return imageResponse(data, contentType);
          }
        }
        return notFound();
      }

      const contentType = contentTypeFrom(result.metadata?.contentType);
      const data = Buffer.from(result.data);
      if (!ALLOWED_IMAGE_TYPES.has(contentType) || !matchesDeclaredImageType(data, contentType)) return notFound();
      return imageResponse(data, contentType);
    } catch (err) {
      console.error('serve-upload error:', err);
      return new Response(JSON.stringify({ error: 'Unable to load image' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };
}

export default createServeUploadHandler();

export const config = { path: '/uploads/*' };
