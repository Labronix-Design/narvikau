import { TestBed } from '@angular/core/testing';
import { SiteSettingsService } from './site-settings.service';
import { StorefrontReadModelService } from './storefront-read-model.service';
import { DEFAULT_CONTACT_INFO, DEFAULT_COMPAT_NOTE, DEFAULT_TRUST_BAR, SiteSettings } from '../_models/site-settings.models';

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

  it('applies preview colours without replacing the saved settings', () => {
    service.commit(saved);

    service.preview(preview);

    expect(document.documentElement.style.getPropertyValue('--nv-bg-dark')).toBe('#1b365d');
    expect(document.documentElement.style.getPropertyValue('--nv-text-main')).toBe('#f5df8b');
    expect(service.settings()).toEqual(saved);
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
