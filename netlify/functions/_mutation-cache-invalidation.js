import { purgePublicCacheTags } from './_cache-invalidation.js';

export const MUTATION_TAGS = Object.freeze({
  product: Object.freeze(['catalogue:products', 'catalogue:compatibility', 'catalogue:storefront']),
  accessory: Object.freeze(['catalogue:accessories', 'catalogue:compatibility', 'catalogue:storefront']),
  category: Object.freeze(['catalogue:categories', 'catalogue:storefront']),
  compatibility: Object.freeze(['catalogue:compatibility', 'catalogue:storefront']),
  siteSettings: Object.freeze(['site-settings', 'catalogue:storefront']),
  legalRefund: Object.freeze(['legal:refund']),
  legalTerms: Object.freeze(['legal:terms']),
  financePage: Object.freeze(['finance-page']),
  promo: Object.freeze(['promo-status']),
  paidOrder: Object.freeze(['promo-status']),
});

export async function purgeMutationCache(kind, purgeTags, context) {
  const tags = MUTATION_TAGS[kind];
  if (!tags) throw new Error('Unknown mutation cache tag mapping');
  try {
    if (purgeTags) await purgeTags([...tags]);
    else await purgePublicCacheTags([...tags], undefined, context);
    return true;
  } catch (cause) {
    console.error(JSON.stringify({
      level: 'ERROR', fn: 'public-cache-purge', msg: 'Post-mutation public cache purge failed',
      mutation: kind, error: cause?.name || 'unknown error', ts: new Date().toISOString(),
    }));
    const error = new Error('Saved data could not be published because the storefront cache refresh is pending. Please retry shortly.');
    error.code = 'CACHE_REFRESH_PENDING';
    throw error;
  }
}
