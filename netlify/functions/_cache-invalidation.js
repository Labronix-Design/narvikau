import { normalisePublicCacheTags } from './_public-cache.js';

function lambdaPurgeToken(context) {
  const token = context?.clientContext?.custom?.purge_api_token;
  return typeof token === 'string' && token.length > 0 ? token : undefined;
}

export function officialPurgeOptions(tags, context) {
  const requested = normalisePublicCacheTags(tags);
  const token = lambdaPurgeToken(context);
  return {
    tags: requested,
    ...(token ? { token } : {}),
  };
}

// This mirrors Netlify's documented server-side cache-purge request without
// importing @netlify/functions at runtime. That import has previously failed
// to bundle in deployed functions, turning an admin save into an import error.
async function purgeViaNetlifyApi({ tags, token }) {
  if (typeof globalThis.fetch !== 'function') throw new Error('Fetch is unavailable in this function runtime');

  const purgeToken = process.env.NETLIFY_PURGE_API_TOKEN || token;
  if (process.env.NETLIFY_LOCAL && !purgeToken) return;

  const siteId = process.env.SITE_ID;
  if (!siteId) throw new Error('Netlify site configuration is unavailable');
  if (!purgeToken) throw new Error('Netlify cache purge credentials are unavailable');

  const response = await globalThis.fetch('https://api.netlify.com/api/v1/purge', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf8',
      Authorization: `Bearer ${purgeToken}`,
    },
    body: JSON.stringify({ cache_tags: tags, site_id: siteId }),
  });
  if (!response.ok) throw new Error(`Cache purge API call returned an unexpected status code: ${response.status}`);
}

// Cache purges are server-only. Custom test seams receive only validated tags
// and never receive the context token or any environment credential.
export async function purgePublicCacheTags(tags, purge, context) {
  const requested = normalisePublicCacheTags(tags);
  if (purge) {
    await purge({ tags: requested });
    return;
  }
  await purgeViaNetlifyApi(officialPurgeOptions(requested, context));
}
