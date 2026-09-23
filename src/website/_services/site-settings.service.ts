import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SiteSettings, DEFAULT_CONTACT_INFO, DEFAULT_TRUST_BAR, DEFAULT_COMPAT_NOTE } from '../_models/site-settings.models';
import { StorefrontReadModelService } from './storefront-read-model.service';

const DEFAULTS: SiteSettings = {
  logo_url: null,
  font_family: 'Inter',
  primary_color: '#ea580c',
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
      this.settings.set({
        ...DEFAULTS,
        ...settings,
        contact: {
          ...DEFAULT_CONTACT_INFO,
          ...settings.contact,
          business_hours: settings.contact?.business_hours?.length
            ? settings.contact.business_hours
            : DEFAULT_CONTACT_INFO.business_hours,
        },
      });
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

  /** Re-applies theme immediately — used by the admin settings page for a live preview before saving. */
  apply(settings: SiteSettings): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const root = document.documentElement.style;
    const color = settings.primary_color || DEFAULTS.primary_color;
    root.setProperty('--nv-orange', color);
    root.setProperty('--nv-orange-hover', darken(color));
    const rgb = toRgbTriplet(color);
    if (rgb) root.setProperty('--nv-orange-rgb', rgb);

    this.applyFont(settings.font_family || DEFAULTS.font_family);
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
    const stack = `'${fontFamily}', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    document.documentElement.style.setProperty('--font-family-base', stack);

    if (fontFamily === 'Inter') return; // already preloaded in index.html

    if (this.injectedFontLink) this.injectedFontLink.remove();
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily).replace(/%20/g, '+')}:wght@400;600;700;800;900&display=swap`;
    document.head.appendChild(link);
    this.injectedFontLink = link;
  }
}
