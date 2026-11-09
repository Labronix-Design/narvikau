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

export const DEFAULT_THEME = Object.freeze({
  version: 1,
  surface: '#0a0908',
  surface_raised: '#171513',
  text: '#f2ede7',
  text_muted: '#c4bdb4',
  border: '#514c46',
  accent: '#ea580c',
  accent_text: '#0a0908',
  focus: '#c1bbb3',
  radius: 'subtle',
  density: 'standard',
});

const THEME_COLOURS = ['surface', 'surface_raised', 'text', 'text_muted', 'border', 'accent', 'accent_text', 'focus'];
const THEME_KEYS = Object.keys(DEFAULT_THEME);
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isColour = (value) => typeof value === 'string' && HEX_COLOR_RE.test(value);
const log = {
  error: (msg, d = {}) => console.error(JSON.stringify({ level: 'ERROR', fn: 'admin-site-settings', msg, ...d, ts: new Date().toISOString() })),
};

function hasThemeShape(theme) {
  return isRecord(theme)
    && Object.keys(theme).length === THEME_KEYS.length
    && THEME_KEYS.every((key) => Object.hasOwn(theme, key))
    && theme.version === 1
    && THEME_COLOURS.every((key) => isColour(theme[key]))
    && ['square', 'subtle', 'rounded'].includes(theme.radius)
    && ['compact', 'standard', 'spacious'].includes(theme.density);
}

function luminance(colour) {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(colour.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function themeContrast(first, second) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function mixColour(surface, text, weight) {
  return '#' + [1, 3, 5].map((offset) => Math.round(
    parseInt(surface.slice(offset, offset + 2), 16) * (1 - weight)
    + parseInt(text.slice(offset, offset + 2), 16) * weight,
  ).toString(16).padStart(2, '0')).join('');
}

// Legacy brand colours remain authoritative only when no canonical theme exists.
// Shape validation also keeps unexpected stored data out of CSS consumers.
export function normaliseTheme(theme, legacy = {}) {
  if (hasThemeShape(theme)) {
    return { ...theme, ...Object.fromEntries(THEME_COLOURS.map((key) => [key, theme[key].toLowerCase()])) };
  }
  const surface = isColour(legacy.background_color) ? legacy.background_color.toLowerCase() : DEFAULT_THEME.surface;
  const text = isColour(legacy.font_color) ? legacy.font_color.toLowerCase() : DEFAULT_THEME.text;
  const accent = isColour(legacy.primary_color) ? legacy.primary_color.toLowerCase() : DEFAULT_THEME.accent;
  const originalSurfaces = surface === DEFAULT_THEME.surface && text === DEFAULT_THEME.text;
  return {
    ...DEFAULT_THEME, surface, text, accent,
    surface_raised: originalSurfaces ? DEFAULT_THEME.surface_raised : mixColour(surface, text, 0.06),
    text_muted: originalSurfaces ? DEFAULT_THEME.text_muted : mixColour(surface, text, 0.8),
    border: originalSurfaces ? DEFAULT_THEME.border : mixColour(surface, text, 0.3),
    focus: originalSurfaces ? DEFAULT_THEME.focus : mixColour(surface, text, 0.75),
    accent_text: themeContrast(accent, '#ffffff') > themeContrast(accent, '#0a0908') ? '#ffffff' : '#0a0908',
  };
}

export function validateTheme(theme) {
  if (!hasThemeShape(theme)) return 'theme must contain exactly the supported version, six-digit hex colours, radius and density';
  const readable = ['surface', 'surface_raised'].every((surface) => ['text', 'text_muted', 'accent'].every((text) => themeContrast(theme[surface], theme[text]) >= 4.5));
  if (!readable || themeContrast(theme.accent, theme.accent_text) < 4.5) {
    return 'theme text contrast must be at least 4.5:1 on page, panel and accent backgrounds';
  }
  return null;
}

export function withCanonicalTheme(settings) {
  return { ...settings, theme: normaliseTheme(settings?.theme, settings) };
}

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
    if (!['GET', 'PUT'].includes(event.httpMethod)) {
      return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
      const authed = await verifyToken(event);
      if (!authed) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
      if (event.httpMethod === 'GET') {
        const [row] = await getSql()`SELECT * FROM site_settings WHERE id = 1`;
        if (!row) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Site settings not found' }) };
        return { statusCode: 200, headers, body: JSON.stringify(withCanonicalTheme(row)) };
      }

      let body;
      try { body = JSON.parse(event.body || '{}'); } catch {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Provide a valid settings object' }) };
      }
      if (!isRecord(body)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Provide a valid settings object' }) };
      const { logo_url, font_family, primary_color, background_color, font_color, hero_slides, brand_logos, contact, trust_bar } = body;
      for (const [key, value] of Object.entries({ primary_color, background_color, font_color })) {
        if (value !== undefined && !isColour(value)) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: `${key} must be a 6-digit hex value, e.g. #ea580c` }) };
        }
      }
      if (typeof font_family !== 'string' || !font_family.trim()) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'font_family is required' }) };
      }
      if (Object.hasOwn(body, 'theme')) {
        const error = validateTheme(body.theme);
        if (error) return { statusCode: hasThemeShape(body.theme) ? 422 : 400, headers, body: JSON.stringify({ error }) };
      }
      const theme = normaliseTheme(body.theme, body);
      const contrastError = validateTheme(theme);
      if (contrastError) return { statusCode: 422, headers, body: JSON.stringify({ error: contrastError }) };
      const [row] = await getSql()`
        UPDATE site_settings SET
          logo_url      = ${logo_url || null},
          font_family   = ${font_family},
          primary_color = ${theme.accent},
          background_color = ${theme.surface},
          font_color    = ${theme.text},
          theme         = ${JSON.stringify(theme)}::jsonb,
          hero_slides   = ${JSON.stringify(sanitizeSlides(hero_slides))}::jsonb,
          brand_logos   = ${JSON.stringify(sanitizeBrandLogos(brand_logos))}::jsonb,
          contact       = ${JSON.stringify(sanitizeContact(contact))}::jsonb,
          trust_bar     = ${JSON.stringify(sanitizeTrustBar(trust_bar))}::jsonb,
          updated_at    = NOW()
        WHERE id = 1
        RETURNING *
      `;
      if (!row) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Site settings not found' }) };
      await purgeMutationCache('siteSettings', purgeTags, context);
      return { statusCode: 200, headers, body: JSON.stringify(withCanonicalTheme(row)) };
    } catch (err) {
      log.error('Settings operation failed', { error: err?.name || 'Error', code: err?.code });
      if (err?.code === 'CACHE_REFRESH_PENDING') {
        return { statusCode: 503, headers, body: JSON.stringify({ error: 'Your settings were saved, but the storefront refresh is pending. Please retry shortly.' }) };
      }
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Site settings could not be loaded or saved. Please try again.' }) };
    }
  };
}

export const handler = createAdminSiteSettingsHandler();
