import { neon } from '@neondatabase/serverless';
import { catalogueCacheHeaders, catalogueUncachedHeaders, readCatalogueReadModel } from './_catalogue-cache.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// Only a successful catalogue payload is cacheable. Preflights, rejected
// methods, and failures carry the uncached headers so the edge never stores a
// bad response in place of the catalogue.
const headers = { ...corsHeaders, ...catalogueCacheHeaders('products') };
const uncachedHeaders = { ...corsHeaders, ...catalogueUncachedHeaders };

export function createCatalogProductsHandler({
  getSql = () => neon(process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL),
} = {}) {
  return async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: uncachedHeaders, body: '' };
    if (event.httpMethod !== 'GET') {
      return { statusCode: 405, headers: uncachedHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
      const products = await readCatalogueReadModel(getSql(), 'products');
      return { statusCode: 200, headers, body: JSON.stringify(products) };
    } catch (err) {
      console.error('catalog-products error:', err);
      return {
        statusCode: 503,
        headers: uncachedHeaders,
        body: JSON.stringify({ error: 'Catalog temporarily unavailable' }),
      };
    }
  };
}

export const handler = createCatalogProductsHandler();
