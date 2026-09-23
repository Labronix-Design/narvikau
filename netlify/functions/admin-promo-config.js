import { neon } from '@neondatabase/serverless';
import { verifyAdminToken } from './admin-auth.js';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Content-Type': 'application/json',
};

// promo_config is seeded by the initial schema migration (id=1, is_active
// TRUE by default) — this endpoint is what actually lets an admin turn the
// launch promo off/on and see current slot usage, which previously required
// direct DB access.
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const authed = await verifyAdminToken(event);
  if (!authed) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };

  const sql = neon(process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL);

  try {
    if (event.httpMethod === 'GET') {
      const [cfg] = await sql`SELECT * FROM promo_config WHERE id = 1`;
      const [{ count: slotsUsed }] = await sql`SELECT COUNT(*) FROM promo_slots WHERE slot_number <= ${cfg?.max_promo_slots ?? 25}`;
      return { statusCode: 200, headers, body: JSON.stringify({ ...cfg, slots_used: Number(slotsUsed) }) };
    }

    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const { is_active, max_promo_slots, discount_percent, standard_installation_cost_zar, deposit_percent } = body;

      const maxSlots = Number(max_promo_slots);
      const discountPct = Number(discount_percent);
      const installCost = Number(standard_installation_cost_zar);
      const depositPct = Number(deposit_percent);

      if (!Number.isFinite(maxSlots) || maxSlots < 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'max_promo_slots must be a valid non-negative number' }) };
      }
      if (!Number.isFinite(discountPct) || discountPct < 0 || discountPct > 100) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'discount_percent must be between 0 and 100' }) };
      }
      if (!Number.isFinite(installCost) || installCost < 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'standard_installation_cost_zar must be a valid non-negative number' }) };
      }
      if (!Number.isFinite(depositPct) || depositPct <= 0 || depositPct > 100) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'deposit_percent must be between 0 and 100' }) };
      }

      const [row] = await sql`
        UPDATE promo_config SET
          is_active                      = ${is_active === true},
          max_promo_slots                = ${maxSlots},
          discount_percent               = ${discountPct},
          standard_installation_cost_zar = ${installCost},
          deposit_percent                = ${depositPct},
          updated_at                     = NOW()
        WHERE id = 1
        RETURNING *
      `;
      return { statusCode: 200, headers, body: JSON.stringify(row) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('admin-promo-config error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
