import { getStore } from '@netlify/blobs';

export function localUploadFallbackUrl(requestUrl, key) {
  const url = new URL(requestUrl);
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return null;
  return `https://www.navrik.co.za/uploads/${encodeURIComponent(key)}`;
}

export default async (req) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const key = decodeURIComponent(new URL(req.url).pathname.split('/').pop() || '');
  if (!key) {
    return new Response(JSON.stringify({ error: 'Missing image key' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const store = getStore('product-images');
    const result = await store.getWithMetadata(key, { type: 'arrayBuffer' });

    if (!result) {
      const fallbackUrl = localUploadFallbackUrl(req.url, key);
      if (fallbackUrl) {
        const liveResponse = await fetch(fallbackUrl);
        if (liveResponse.ok) {
          return new Response(await liveResponse.arrayBuffer(), {
            status: 200,
            headers: {
              'Content-Type': liveResponse.headers.get('content-type') || 'application/octet-stream',
              'Cache-Control': 'public, max-age=31536000, immutable',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      }
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const contentType = result.metadata?.contentType || 'application/octet-stream';
    return new Response(result.data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error('serve-upload error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = { path: '/uploads/*' };
