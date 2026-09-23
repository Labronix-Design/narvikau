// Shared cache policy for the public, anonymous read endpoints.
//
// The metered resource on the managed Postgres instance is compute *active
// time*, not query count: any query wakes the compute and holds it awake for
// the whole idle window that follows. Serving these responses only from the
// browser cache meant every new visitor, every crawler pass, and every cold
// tab woke the database, which is how the plan's active-time quota ran out.
//
// `Netlify-CDN-Cache-Control` keeps the response in Netlify's durable cache so
// a miss — not a request — reaches the database, while the shorter
// `Cache-Control` window keeps browsers reasonably fresh. `stale-while-
// revalidate` lets the edge answer instantly from a stale copy and refresh in
// the background, so a visitor never waits on a database wake-up.

const PUBLIC_CACHE_TAGS = new Set([
  'catalogue:products',
  'catalogue:storefront',
  'site-settings',
  'legal:refund',
  'legal:terms',
  'finance-page',
]);

export function normalisePublicCacheTags(tags) {
  const requested = Array.isArray(tags) ? [...new Set(tags)] : [];
  if (!requested.length || !requested.every((tag) => PUBLIC_CACHE_TAGS.has(tag))) {
    throw new Error('Unknown public cache tag');
  }
  return requested;
}

export function publicReadCacheHeaders({ browserSeconds, cdnSeconds, staleSeconds }) {
  return {
    'Cache-Control': `public, max-age=${browserSeconds}, stale-while-revalidate=${staleSeconds}`,
    'Netlify-CDN-Cache-Control': `public, durable, s-maxage=${cdnSeconds}, stale-while-revalidate=${staleSeconds}`,
  };
}

export function taggedPublicReadHeaders({ tags, browserSeconds, cdnSeconds, staleSeconds }) {
  const requested = normalisePublicCacheTags(tags);
  return {
    ...publicReadCacheHeaders({ browserSeconds, cdnSeconds, staleSeconds }),
    'Netlify-Cache-Tag': requested.join(','),
  };
}

// Failures and rejected methods are never cached. A transient database error
// must not be stored at the edge, or one bad moment would be replayed to every
// visitor for the whole cache window.
export const uncachedResponseHeaders = {
  'Cache-Control': 'no-store',
  'Netlify-CDN-Cache-Control': 'no-store',
};
