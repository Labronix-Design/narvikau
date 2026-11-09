import { TestBed } from '@angular/core/testing';
import { accessibleAccentHover, SiteSettingsService, themeContrast } from './site-settings.service';
import { StorefrontReadModelService } from './storefront-read-model.service';
import { DEFAULT_CONTACT_INFO, DEFAULT_COMPAT_NOTE, DEFAULT_TRUST_BAR, SiteSettings, SiteTheme } from '../_models/site-settings.models';

describe('SiteSettingsService theme preview', () => {
  let service: SiteSettingsService;

  const saved = settings('#121212', '#eeeeee');
  const preview = settings('#1b365d', '#f5df8b');

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SiteSettingsService,
        { provide: StorefrontReadModelService, useValue: { load: async () => undefined, model: () => null, error: () => null } },
      ],
    });
    service = TestBed.inject(SiteSettingsService);
  });

  afterEach(() => document.documentElement.removeAttribute('style'));

  it('normalises legacy settings without losing the saved brand colours', () => {
    service.commit(saved);

    expect(service.settings().theme).toEqual({
      version: 1, surface: '#121212', surface_raised: '#1f1f1f',
      text: '#eeeeee', text_muted: '#c2c2c2', border: '#545454',
      accent: '#ea580c', accent_text: '#0a0908', focus: '#b7b7b7',
      radius: 'subtle', density: 'standard',
    });
  });

  it('keeps accent text readable on its hover surface', () => {
    const hover = accessibleAccentHover('#ea580c', '#0a0908');
    expect(themeContrast(hover, '#0a0908')).toBeGreaterThanOrEqual(4.5);
    expect(hover).not.toBe('#ea580c');
  });

  it('applies canonical tokens to root before the admin shell exists', () => {
    const theme: SiteTheme = {
      version: 1, surface: '#ffffff', surface_raised: '#f0f0f0',
      text: '#101010', text_muted: '#555555', border: '#888888',
      accent: '#112233', accent_text: '#ffffff', focus: '#334455',
      radius: 'rounded', density: 'compact',
    };
    service.commit({ ...saved, theme });

    const root = document.documentElement.style;
    expect(root.getPropertyValue('--admin-page')).toBe('#ffffff');
    expect(root.getPropertyValue('--admin-surface-raised')).toBe('#f0f0f0');
    expect(root.getPropertyValue('--admin-text-muted')).toBe('#555555');
    expect(root.getPropertyValue('--nv-accent-text')).toBe('#ffffff');
    expect(root.getPropertyValue('--nv-orange')).toBe('#112233');
    expect(root.getPropertyValue('--nv-border')).toBe('#888888');
    expect(root.getPropertyValue('--ui-radius')).toBe('12px');
    expect(root.getPropertyValue('--ui-density-control-height')).toBe('36px');
    expect(service.settings().primary_color).toBe('#112233');
  });

  it('restores every structured token after a preview', () => {
    service.commit(saved);
    service.preview({ ...preview, theme: {
      version: 1, surface: '#ffffff', surface_raised: '#eeeeee', text: '#111111',
      text_muted: '#555555', border: '#888888', accent: '#112233',
      accent_text: '#ffffff', focus: '#334455', radius: 'square', density: 'spacious',
    } });
    service.cancelPreview();

    const root = document.documentElement.style;
    expect(root.getPropertyValue('--admin-page')).toBe('#121212');
    expect(root.getPropertyValue('--admin-text-muted')).toBe('#c2c2c2');
    expect(root.getPropertyValue('--ui-radius')).toBe('4px');
    expect(root.getPropertyValue('--ui-density-control-height')).toBe('42px');
  });

  it('commits a canonical response as the baseline for subsequent previews', () => {
    service.commit(saved);
    service.preview(preview);
    service.commit({ ...preview, theme: {
      version: 1, surface: '#ffffff', surface_raised: '#eeeeee', text: '#111111',
      text_muted: '#555555', border: '#888888', accent: '#112233',
      accent_text: '#ffffff', focus: '#334455', radius: 'square', density: 'spacious',
    } });
    service.cancelPreview();

    expect(document.documentElement.style.getPropertyValue('--admin-page')).toBe('#ffffff');
    expect(service.settings().theme?.accent).toBe('#112233');
  });

  it('applies preview colours without replacing the saved settings', () => {
    service.commit(saved);

    service.preview(preview);

    expect(document.documentElement.style.getPropertyValue('--nv-bg-dark')).toBe('#1b365d');
    expect(document.documentElement.style.getPropertyValue('--nv-text-main')).toBe('#f5df8b');
    expect(service.settings().background_color).toBe('#121212');
  });

  it('restores the saved theme when a preview is cancelled', () => {
    service.commit(saved);
    service.preview(preview);

    service.cancelPreview();

    expect(document.documentElement.style.getPropertyValue('--nv-bg-dark')).toBe('#121212');
    expect(document.documentElement.style.getPropertyValue('--nv-text-main')).toBe('#eeeeee');
  });
});

function settings(background_color: string, font_color: string): SiteSettings {
  return {
    logo_url: null,
    font_family: 'Inter',
    primary_color: '#ea580c',
    background_color,
    font_color,
    hero_slides: [],
    brand_logos: [],
    contact: DEFAULT_CONTACT_INFO,
    trust_bar: DEFAULT_TRUST_BAR,
    compat_note: DEFAULT_COMPAT_NOTE,
  };
}
