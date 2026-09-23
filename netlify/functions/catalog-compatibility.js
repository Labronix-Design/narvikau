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
const headers = { ...corsHeaders, ...catalogueCacheHeaders('compatibility') };
const uncachedHeaders = { ...corsHeaders, ...catalogueUncachedHeaders };

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: uncachedHeaders, body: '' };
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: uncachedHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const sql = neon(process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL);

  try {
    const rules = await readCatalogueReadModel(sql, 'compatibility');
    return { statusCode: 200, headers, body: JSON.stringify(rules) };
  } catch (err) {
    console.error('catalog-compatibility error:', err);
    return { statusCode: 500, headers: uncachedHeaders, body: JSON.stringify({ error: 'Failed to load compatibility' }) };
  }
};
