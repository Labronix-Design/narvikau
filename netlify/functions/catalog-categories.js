import { neon } from '@neondatabase/serverless';
import { catalogueCacheHeaders, catalogueUncachedHeaders, readCatalogueReadModel } from './_catalogue-cache.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const headers = { ...corsHeaders, ...catalogueCacheHeaders('categories') };
const uncachedHeaders = { ...corsHeaders, ...catalogueUncachedHeaders };

export function createCatalogCategoriesHandler({
  getSql = () => neon(process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL),
} = {}) {
  return async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: uncachedHeaders, body: '' };
    if (event.httpMethod !== 'GET') {
      return { statusCode: 405, headers: uncachedHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
      const categories = await readCatalogueReadModel(getSql(), 'categories');
      return { statusCode: 200, headers, body: JSON.stringify(categories) };
    } catch (error) {
      console.error(JSON.stringify({
        level: 'ERROR', fn: 'catalog-categories', msg: 'Database read failed',
        error: error?.name || 'Error', code: error?.code, ts: new Date().toISOString(),
      }));
      return {
        statusCode: 503,
        headers: uncachedHeaders,
        body: JSON.stringify({ error: 'Catalog temporarily unavailable' }),
      };
    }
  };
}

export const handler = createCatalogCategoriesHandler();
