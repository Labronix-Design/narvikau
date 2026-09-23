import { neon } from '@neondatabase/serverless';
import { taggedPublicReadHeaders, uncachedResponseHeaders } from './_public-cache.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

// Promotion state changes only through an authenticated admin mutation or a
// verified order transition; both purge the promo-status tag. A durable edge
// response therefore avoids a database/function invocation per visitor while
// retaining accurate state after those server-side mutations.
const headers = {
  ...corsHeaders,
  ...taggedPublicReadHeaders({ tags: ['promo-status'], browserSeconds: 300, cdnSeconds: 604800, staleSeconds: 2592000 }),
};

const uncachedHeaders = { ...corsHeaders, ...uncachedResponseHeaders };

// Public, read-only view of the launch promo — powers promo messaging on the
// storefront (hero, bento card) so it never claims a deal that isn't real.
// Exposes only the aggregate counts from `promo_status`; no customer data.
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: uncachedHeaders, body: '' };
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: uncachedHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const sql = neon(process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL);

  try {
    // The view's WHERE clause already excludes it when promo_config.is_active = false.
    const [row] = await sql`
      SELECT max_promo_slots, discount_percent, slots_remaining, promo_exhausted
      FROM promo_status
      LIMIT 1
    `;
    const active = !!row && !row.promo_exhausted && row.slots_remaining > 0;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        active,
        discountPercent: row ? Number(row.discount_percent) : 0,
        slotsRemaining: row ? row.slots_remaining : 0,
        maxSlots: row ? row.max_promo_slots : 0,
      }),
    };
  } catch (err) {
    console.error('promo-status error:', err);
    // Fail closed — if we can't confirm the promo is real, don't advertise one.
    return {
      statusCode: 200,
      headers: uncachedHeaders,
      body: JSON.stringify({ active: false, discountPercent: 0, slotsRemaining: 0, maxSlots: 0 }),
    };
  }
};
