import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SiteSettings, SiteTheme, DEFAULT_SITE_THEME, DEFAULT_CONTACT_INFO, DEFAULT_TRUST_BAR, DEFAULT_COMPAT_NOTE, GOOGLE_FONT_OPTIONS } from '../_models/site-settings.models';
import { StorefrontReadModelService } from './storefront-read-model.service';

const DEFAULTS: SiteSettings = {
  theme: DEFAULT_SITE_THEME,
  logo_url: null,
  font_family: 'Inter',
  primary_color: '#ea580c',
  background_color: '#0a0908',
  font_color: '#f2ede7',
  hero_slides: [],
  brand_logos: [],
  contact: DEFAULT_CONTACT_INFO,
  trust_bar: DEFAULT_TRUST_BAR,
  compat_note: DEFAULT_COMPAT_NOTE,
};

function darken(hex: string, amount = 0.16): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  const r = Math.round(((num >> 16) & 0xff) * (1 - amount));
  const g = Math.round(((num >> 8) & 0xff) * (1 - amount));
  const b = Math.round((num & 0xff) * (1 - amount));
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

function toRgbTriplet(hex: string): string | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const num = parseInt(m[1], 16);
  return `${(num >> 16) & 0xff}, ${(num >> 8) & 0xff}, ${num & 0xff}`;
}

function mix(hex: string, target: string, targetWeight: number): string {
  const sourceMatch = /^#([0-9a-f]{6})$/i.exec(hex);
  const targetMatch = /^#([0-9a-f]{6})$/i.exec(target);
  if (!sourceMatch || !targetMatch) return hex;

  const source = parseInt(sourceMatch[1], 16);
  const targetValue = parseInt(targetMatch[1], 16);
  const channel = (shift: number) => Math.round(
    (((source >> shift) & 0xff) * (1 - targetWeight))
      + (((targetValue >> shift) & 0xff) * targetWeight),
  );
  return `#${[channel(16), channel(8), channel(0)].map(value => value.toString(16).padStart(2, '0')).join('')}`;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

/** WCAG relative luminance contrast, shared with the settings form guardrail. */
export function themeContrast(first: string, second: string): number {
  if (![first, second].every(value => /^#[0-9a-f]{6}$/i.test(value))) return 0;
  const values = [luminance(first), luminance(second)];
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}

/** Produces a perceptible hover surface while retaining readable accent text. */
export function accessibleAccentHover(accent: string, accentText: string): string {
  if (![accent, accentText].every(value => /^#[0-9a-f]{6}$/i.test(value))) return accent;
  const direction = luminance(accentText) > 0.5 ? '#000000' : '#ffffff';
  for (const weight of [0.16, 0.12, 0.08, 0.04]) {
    const candidate = mix(accent, direction, weight);
    if (themeContrast(candidate, accentText) >= 4.5) return candidate;
  }
  return accent;
}

/** Backfill legacy colours with the same derivations as the settings API. */
export function normaliseSiteTheme(settings: Partial<SiteSettings>): SiteTheme {
  const hex = (value: unknown, fallback: string): string =>
    typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
  const theme = settings.theme;
  const surface = hex(theme?.surface, hex(settings.background_color, DEFAULT_SITE_THEME.surface));
  const text = hex(theme?.text, hex(settings.font_color, DEFAULT_SITE_THEME.text));
  const accent = hex(theme?.accent, hex(settings.primary_color, DEFAULT_SITE_THEME.accent));
  const accentText = themeContrast(accent, '#0a0908') >= themeContrast(accent, '#ffffff') ? '#0a0908' : '#ffffff';
  const originalSurfaces = surface === DEFAULT_SITE_THEME.surface && text === DEFAULT_SITE_THEME.text;
  return {
    version: 1, surface, text, accent,
    surface_raised: hex(theme?.surface_raised, originalSurfaces ? DEFAULT_SITE_THEME.surface_raised : mix(surface, text, 0.06)),
    text_muted: hex(theme?.text_muted, originalSurfaces ? DEFAULT_SITE_THEME.text_muted : mix(surface, text, 0.8)),
    border: hex(theme?.border, originalSurfaces ? DEFAULT_SITE_THEME.border : mix(surface, text, 0.3)),
    accent_text: hex(theme?.accent_text, accentText),
    focus: hex(theme?.focus, originalSurfaces ? DEFAULT_SITE_THEME.focus : mix(surface, text, 0.75)),
    radius: theme?.radius === 'square' || theme?.radius === 'rounded' ? theme.radius : 'subtle',
    density: theme?.density === 'compact' || theme?.density === 'spacious' ? theme.density : 'standard',
  };
}

function normaliseSettings(settings: SiteSettings): SiteSettings {
  const theme = normaliseSiteTheme(settings);
  return { ...settings, theme, primary_color: theme.accent, background_color: theme.surface, font_color: theme.text };
}

@Injectable({ providedIn: 'root' })
export class SiteSettingsService {
  private storefront = inject(StorefrontReadModelService);
  private platformId = inject(PLATFORM_ID);

  readonly settings = signal<SiteSettings>(DEFAULTS);
  /** Becomes true after the first settings request succeeds or fails. */
  readonly resolved = signal(false);
  /** True when the public settings endpoint could not provide a real configuration. */
  readonly unavailable = signal(false);
  private loaded = false;
  private previewing = false;
  private injectedFontLink: HTMLLinkElement | null = null;

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      await this.storefront.load();
      const settings = this.storefront.model()?.settings;
      if (!settings) throw new Error(this.storefront.error() || 'Storefront content is unavailable');
      // Shallow-merge everything except `contact`, which needs its own
      // fallback per-field — an admin who's only set an email shouldn't
      // lose the default business hours in the process.
      this.settings.set(normaliseSettings({
        ...DEFAULTS,
        ...settings,
        theme: normaliseSiteTheme(settings),
        contact: {
          ...DEFAULT_CONTACT_INFO,
          ...settings.contact,
          business_hours: settings.contact?.business_hours?.length
            ? settings.contact.business_hours
            : DEFAULT_CONTACT_INFO.business_hours,
        },
      }));
      this.unavailable.set(false);
    } catch (err) {
      console.error('SiteSettingsService load failed:', err);
      // Keep the safe initial theme, but do not represent it as loaded public
      // configuration. Customer UI uses `unavailable` to disclose this state.
      this.unavailable.set(true);
      this.loaded = false;
    } finally {
      this.resolved.set(true);
    }
    this.apply(this.settings());
  }

  /** Applies a temporary theme without changing the saved public configuration. */
  preview(settings: SiteSettings): void {
    this.previewing = true;
    this.apply(settings);
  }

  /** Applies a saved configuration and makes it the theme restored after a preview. */
  commit(settings: SiteSettings): void {
    this.previewing = false;
    const canonical = normaliseSettings(settings);
    this.settings.set(canonical);
    this.apply(canonical);
  }

  /** Restores the saved configuration after an admin dismisses a preview. */
  cancelPreview(): void {
    if (!this.previewing) return;
    this.previewing = false;
    this.apply(this.settings());
  }

  /** Re-applies theme immediately. Prefer preview() or commit() when changing settings. */
  apply(settings: SiteSettings): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const root = document.documentElement.style;
    const theme = normaliseSiteTheme(settings);
    const color = theme.accent;
    const backgroundColor = theme.surface;
    const fontColor = theme.text;
    root.setProperty('--nv-surface', theme.surface);
    root.setProperty('--nv-surface-raised', theme.surface_raised);
    root.setProperty('--nv-border', theme.border);
    root.setProperty('--nv-accent-text', theme.accent_text);
    root.setProperty('--nv-text-on-accent', theme.accent_text);
    root.setProperty('--nv-focus', theme.focus);
    root.setProperty('--nv-focus-ring', theme.focus);
    root.setProperty('--ui-radius', { square: '0px', subtle: '4px', rounded: '12px' }[theme.radius]);
    const density = { compact: ['8px', '36px'], standard: ['12px', '42px'], spacious: ['16px', '48px'] }[theme.density];
    root.setProperty('--ui-density-gap', density[0]);
    root.setProperty('--ui-density-padding', density[0]);
    root.setProperty('--ui-density-control-height', density[1]);
    root.setProperty('--nv-orange', color);
    root.setProperty('--nv-orange-hover', accessibleAccentHover(color, theme.accent_text));
    root.setProperty('--nv-ink', backgroundColor);
    root.setProperty('--nv-bg-dark', backgroundColor);
    root.setProperty('--nv-text-main', fontColor);
    root.setProperty('--nv-carbon', theme.surface_raised);
    root.setProperty('--nv-gunmetal', mix(backgroundColor, fontColor, 0.14));
    root.setProperty('--nv-alloy-muted', mix(backgroundColor, fontColor, 0.55));
    root.setProperty('--nv-alloy', mix(backgroundColor, fontColor, 0.78));
    root.setProperty('--nv-aluminum', theme.text_muted);
    root.setProperty('--nv-aluminum-light', theme.text);
    root.setProperty('--nv-aluminum-dark', theme.border);
    root.setProperty('--nv-metal', theme.border);
    root.setProperty('--nv-metal-light', mix(backgroundColor, fontColor, 0.55));
    root.setProperty('--nv-text-muted', theme.text_muted);
    root.setProperty('--nv-scrollbar-track', mix(backgroundColor, fontColor, 0.075));
    root.setProperty('--nv-scrollbar-thumb', mix(backgroundColor, fontColor, 0.55));
    root.setProperty('--nv-scrollbar-thumb-hover', mix(backgroundColor, fontColor, 0.78));
    const rgb = toRgbTriplet(color);
    if (rgb) root.setProperty('--nv-orange-rgb', rgb);

    this.applyAdminTheme(theme);

    this.applyFont(settings.font_family || DEFAULTS.font_family);
  }

  private applyAdminTheme(theme: SiteTheme): void {
    const set = (name: string, value: string) => document.documentElement.style.setProperty(name, value);
    set('--admin-page', theme.surface);
    set('--admin-surface-sunken', theme.surface);
    set('--admin-surface-raised', theme.surface_raised);
    set('--admin-surface-hover', mix(theme.surface_raised, theme.text, 0.06));
    set('--admin-text', theme.text);
    set('--admin-text-muted', theme.text_muted);
    set('--admin-text-subtle', theme.text_muted);
    set('--admin-border', theme.border);
    set('--admin-accent', theme.accent);
    set('--admin-accent-text', theme.accent_text);
    set('--admin-focus', theme.focus);
    set('--admin-focus-ring', theme.focus);
    // Status emphasis follows the selected palette, including accessible text.
    for (const status of ['success', 'warning', 'danger', 'info']) {
      set(`--admin-${status}`, theme.text);
      set(`--admin-${status}-bg`, mix(theme.surface, theme.accent, 0.12));
      set(`--admin-${status}-border`, theme.border);
    }
  }

  /** Returns a right-sized Netlify Image CDN URL for a same-site admin upload. */
  uploadVariantUrl(src: string, width: number): string {
    if (!isPlatformBrowser(this.platformId) || !src) return src;
    const absoluteSource = new URL(src, document.baseURI);
    const isLocalUpload = absoluteSource.origin === document.location.origin
      && absoluteSource.pathname.startsWith('/uploads/');
    if (!isLocalUpload) return src;
    return `/.netlify/images?url=${encodeURIComponent(absoluteSource.href)}&w=${width}`;
  }

  private applyFont(fontFamily: string): void {
    const family = GOOGLE_FONT_OPTIONS.find(option => option === fontFamily) || 'Inter';
    const stack = `'${family}', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    document.documentElement.style.setProperty('--font-family-base', stack);

    if (this.injectedFontLink) this.injectedFontLink.remove();
    this.injectedFontLink = null;
    if (family === 'Inter') return; // already preloaded in index.html
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@400;600;700;800;900&display=swap`;
    document.head.appendChild(link);
    this.injectedFontLink = link;
  }
}
