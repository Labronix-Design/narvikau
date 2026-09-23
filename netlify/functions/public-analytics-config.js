const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=300, s-maxage=86400, stale-while-revalidate=2592000',
  'Netlify-CDN-Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=2592000',
  'Netlify-Cache-Tag': 'analytics-config',
  'X-Content-Type-Options': 'nosniff',
};

// GA measurement IDs are public identifiers, not credentials. Keep the value
// server-configured so a client build never contains environment settings and
// collection can be enabled only after the consent-aware client has loaded it.
const measurementIdPattern = /^G-[A-Z0-9]{6,16}$/;

function publicConfig(env = process.env) {
  const measurementId = typeof env.GA4_MEASUREMENT_ID === 'string'
    ? env.GA4_MEASUREMENT_ID.trim().toUpperCase()
    : '';

  if (!measurementIdPattern.test(measurementId)) {
    return { enabled: false, measurementId: null };
  }

  return { enabled: true, measurementId };
}

export function createHandler({ env = process.env } = {}) {
  return async (event = {}) => {
    if (event.httpMethod !== 'GET') {
      return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    // Do not provide a public refresh or cache-bypass mechanism. Configuration
    // changes are deployed server-side and naturally expire at the CDN edge.
    if (event.queryStringParameters && Object.keys(event.queryStringParameters).length > 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Query parameters are not supported' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify(publicConfig(env)) };
  };
}

export const handler = createHandler();
