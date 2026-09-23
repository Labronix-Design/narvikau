import { neon } from '@neondatabase/serverless';
import { verifyAdminToken } from './admin-auth.js';
import { purgeMutationCache } from './_mutation-cache-invalidation.js';

const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
  Pragma: 'no-cache',
  Expires: '0',
};

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function sanitizeContact(contact) {
  if (!contact || typeof contact !== 'object') return {};
  const out = {};
  if (typeof contact.email === 'string') out.email = contact.email.trim();
  if (typeof contact.phone === 'string') out.phone = contact.phone.trim();
  if (typeof contact.whatsapp === 'string') out.whatsapp = contact.whatsapp.trim();
  if (typeof contact.location === 'string') out.location = contact.location.trim();
  if (Array.isArray(contact.business_hours)) {
    out.business_hours = contact.business_hours
      .filter(r => r && typeof r.label === 'string' && r.label.trim())
      .map(r => ({
        label: r.label.trim(),
        hours: typeof r.hours === 'string' ? r.hours.trim() : '',
        closed: !!r.closed,
      }));
  }
  return out;
}

function sanitizeSlides(hero_slides) {
  if (!Array.isArray(hero_slides)) return [];
  return hero_slides
    .filter(s => s && typeof s.image_url === 'string' && s.image_url.trim())
    .map(s => ({ image_url: s.image_url.trim(), alt: typeof s.alt === 'string' ? s.alt.trim() : '' }));
}

function sanitizeTrustBar(trust_bar) {
  if (!Array.isArray(trust_bar)) return [];
  return trust_bar
    .filter(t => t && typeof t.label === 'string' && t.label.trim())
    .map(t => ({
      label: t.label.trim(),
      icon: typeof t.icon === 'string' && t.icon.trim() ? t.icon.trim() : 'check_circle',
    }));
}

function sanitizeBrandLogos(brand_logos) {
  if (!Array.isArray(brand_logos)) return [];
  return brand_logos
    .filter(b => b && typeof b.logo_url === 'string' && b.logo_url.trim() && typeof b.brand === 'string' && b.brand.trim())
    .map(b => ({
      brand: b.brand.trim(),
      model: typeof b.model === 'string' ? b.model.trim() : '',
      logo_url: b.logo_url.trim(),
    }));
}

export function createAdminSiteSettingsHandler({
  verifyToken = verifyAdminToken,
  getSql = () => neon(process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL),
  purgeTags,
} = {}) {
  return async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const authed = await verifyToken(event);
  if (!authed) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };

  const sql = getSql();
  try {
    if (event.httpMethod === 'GET') {
      const [row] = await sql`SELECT * FROM site_settings WHERE id = 1`;
      return { statusCode: 200, headers, body: JSON.stringify(row) };
    }

    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const { logo_url, font_family, primary_color, hero_slides, brand_logos, contact, trust_bar, compat_note } = body;

      if (primary_color && !HEX_COLOR_RE.test(primary_color)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'primary_color must be a 6-digit hex value, e.g. #ea580c' }) };
      }
      if (!font_family || typeof font_family !== 'string') {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'font_family is required' }) };
      }

      const [row] = await sql`
        UPDATE site_settings SET
          logo_url      = ${logo_url || null},
          font_family   = ${font_family},
          primary_color = ${primary_color || '#ea580c'},
          hero_slides   = ${JSON.stringify(sanitizeSlides(hero_slides))}::jsonb,
          brand_logos   = ${JSON.stringify(sanitizeBrandLogos(brand_logos))}::jsonb,
          contact       = ${JSON.stringify(sanitizeContact(contact))}::jsonb,
          trust_bar     = ${JSON.stringify(sanitizeTrustBar(trust_bar))}::jsonb,
          compat_note   = ${typeof compat_note === 'string' ? compat_note.trim() : ''},
          updated_at    = NOW()
        WHERE id = 1
        RETURNING *
      `;
      if (!row) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Site settings not found' }) };
      await purgeMutationCache('siteSettings', purgeTags, context);
      return { statusCode: 200, headers, body: JSON.stringify(row) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('admin-site-settings error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
  };
}

export const handler = createAdminSiteSettingsHandler();
