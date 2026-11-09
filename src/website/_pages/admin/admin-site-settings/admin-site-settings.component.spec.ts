import { TestBed } from '@angular/core/testing';
import { AdminSiteSettingsComponent } from './admin-site-settings.component';
import { AdminService } from '../../../_services/admin.service';
import { ModalService } from '../../../_services/modal.service';
import { SiteSettingsService } from '../../../_services/site-settings.service';
import { StorefrontReadModelService } from '../../../_services/storefront-read-model.service';
import { DEFAULT_CONTACT_INFO, DEFAULT_SITE_THEME, SiteSettings } from '../../../_models/site-settings.models';

describe('AdminSiteSettingsComponent structured theme', () => {
  let component: AdminSiteSettingsComponent;
  let service: SiteSettingsService;
  let submitted: SiteSettings | undefined;
  const saved: SiteSettings = {
    logo_url: null, font_family: 'Inter', primary_color: '#ea580c',
    background_color: '#0a0908', font_color: '#f2ede7', theme: DEFAULT_SITE_THEME,
    contact: DEFAULT_CONTACT_INFO, hero_slides: [], brand_logos: [], trust_bar: [], compat_note: '',
  };

  beforeEach(async () => {
    submitted = undefined;
    TestBed.configureTestingModule({ providers: [
      { provide: AdminService, useValue: {
        getSiteSettings: async () => saved,
        updateSiteSettings: async (payload: SiteSettings) => {
          submitted = payload;
          return { ...payload, theme: { ...payload.theme!, accent: '#f1a16c', accent_text: '#0a0908' } };
        },
      } },
      { provide: ModalService, useValue: { alert: async () => undefined } },
      { provide: StorefrontReadModelService, useValue: { load: async () => undefined, model: () => null, error: () => null } },
    ] });
    service = TestBed.inject(SiteSettingsService);
    component = TestBed.runInInjectionContext(() => new AdminSiteSettingsComponent());
    await component.ngOnInit();
  });

  afterEach(() => { component.ngOnDestroy(); document.documentElement.removeAttribute('style'); });

  it('rejects malformed values for every colour and both layout controls', () => {
    for (const key of ['surface', 'surface_raised', 'text', 'text_muted', 'border', 'accent', 'accent_text'] as const) {
      const control = component.form.controls.theme.controls[key];
      const original = control.value;
      control.setValue('#abc');
      expect(control.invalid).withContext(key).toBeTrue();
      control.setValue(original);
    }
    component.form.controls.theme.controls.radius.setValue('pill' as 'subtle');
    expect(component.form.controls.theme.controls.radius.invalid).toBeTrue();
    component.form.controls.theme.controls.density.setValue('tiny' as 'standard');
    expect(component.form.controls.theme.controls.density.invalid).toBeTrue();
  });

  it('blocks preview and save for unreadable body, muted, or accent text', async () => {
    component.form.controls.theme.controls.text.setValue('#0a0908');
    component.previewTheme();
    await component.save();
    expect(component.form.controls.theme.hasError('contrast')).toBeTrue();
    expect(component.previewingTheme()).toBeFalse();
    expect(submitted).toBeUndefined();
    component.resetThemePreview();
    component.form.controls.theme.controls.text_muted.setValue('#0a0908');
    expect(component.form.controls.theme.hasError('contrast')).toBeTrue();
    component.form.controls.theme.controls.text_muted.setValue(DEFAULT_SITE_THEME.text_muted);
    component.form.controls.theme.controls.accent.setValue('#0a0908');
    expect(component.form.controls.theme.hasError('contrast')).toBeTrue();
    component.form.controls.theme.controls.accent.setValue(DEFAULT_SITE_THEME.accent);
    component.form.controls.theme.controls.accent_text.setValue('#ea580c');
    expect(component.form.controls.theme.hasError('contrast')).toBeTrue();
  });

  it('previews the structured palette and resets all theme controls and root tokens', () => {
    component.form.controls.theme.patchValue({ accent: '#f1a16c', accent_text: '#0a0908', radius: 'rounded', density: 'compact' });
    component.previewTheme();
    expect(document.documentElement.style.getPropertyValue('--nv-orange')).toBe('#f1a16c');
    expect(document.documentElement.style.getPropertyValue('--ui-radius')).toBe('12px');
    component.resetThemePreview();
    expect(component.form.controls.theme.controls.accent.value).toBe('#ea580c');
    expect(component.form.controls.theme.controls.radius.value).toBe('subtle');
    expect(document.documentElement.style.getPropertyValue('--nv-orange')).toBe('#ea580c');
  });

  it('uses the preview palette in the save payload and reflects the canonical response', async () => {
    component.form.controls.theme.patchValue({ accent: '#f1a16c', accent_text: '#0a0908', radius: 'rounded' });
    component.previewTheme();
    await component.save();
    expect(submitted?.theme?.accent).toBe('#f1a16c');
    expect(submitted?.theme?.radius).toBe('rounded');
    expect(component.form.controls.theme.controls.accent.value).toBe('#f1a16c');
    expect(service.settings().theme?.accent).toBe('#f1a16c');
    expect(document.documentElement.style.getPropertyValue('--nv-orange')).toBe('#f1a16c');
    expect(component.previewingTheme()).toBeFalse();
  });
});
