import { ChangeDetectionStrategy, Component, inject, signal, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AdminService } from '../../../_services/admin.service';
import { ModalService } from '../../../_services/modal.service';
import { normaliseSiteTheme, SiteSettingsService, themeContrast } from '../../../_services/site-settings.service';
import { ImageUploadComponent } from '../../../_components/image-upload/image-upload.component';
import {
  HeroSlide, BrandLogo, BusinessHoursRow, TrustBarItem, GOOGLE_FONT_OPTIONS,
  DEFAULT_HERO_SLIDES, DEFAULT_BRAND_LOGOS, DEFAULT_CONTACT_INFO,
  DEFAULT_TRUST_BAR, DEFAULT_COMPAT_NOTE, DEFAULT_SITE_THEME, SiteTheme, SiteSettings,
} from '../../../_models/site-settings.models';

type SettingsSection = 'branding' | 'contact' | 'hero' | 'compatibility';
type ThemeColourKey = 'accent' | 'surface' | 'surface_raised' | 'text' | 'text_muted' | 'border' | 'accent_text';
const hexValidators = [Validators.required, Validators.pattern(/^#[0-9a-fA-F]{6}$/)];
const oneOf = (values: readonly string[]): ValidatorFn => (control: AbstractControl): ValidationErrors | null =>
  values.includes(control.value) ? null : { option: true };
const themeContrastValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const theme = control.value as SiteTheme;
  if (themeContrast(theme.text, theme.surface) < 4.5 || themeContrast(theme.text, theme.surface_raised) < 4.5
      || themeContrast(theme.text_muted, theme.surface) < 4.5 || themeContrast(theme.text_muted, theme.surface_raised) < 4.5
      || themeContrast(theme.accent, theme.surface) < 4.5 || themeContrast(theme.accent, theme.surface_raised) < 4.5
      || themeContrast(theme.accent_text, theme.accent) < 4.5) return { contrast: true };
  return null;
};

@Component({
  selector: 'website-admin-site-settings',
  templateUrl: './admin-site-settings.component.html',
  styleUrls: ['./admin-site-settings.component.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, ImageUploadComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSiteSettingsComponent implements OnInit, OnDestroy {
  private adminService = inject(AdminService);
  private modal = inject(ModalService);
  private siteSettingsService = inject(SiteSettingsService);
  private fb = inject(FormBuilder);

  readonly fontOptions = GOOGLE_FONT_OPTIONS;
  readonly themeColours: { key: ThemeColourKey; label: string; help: string }[] = [
    { key: 'accent', label: 'Accent colour', help: 'Buttons, links and highlighted details.' },
    { key: 'surface', label: 'Page background', help: 'The background of the public site and admin workspace.' },
    { key: 'surface_raised', label: 'Panel / surface colour', help: 'Cards, navigation, form controls and dialogs.' },
    { key: 'text', label: 'Primary text colour', help: 'Headings and body copy on pages and panels.' },
    { key: 'text_muted', label: 'Muted text colour', help: 'Supporting labels and secondary information.' },
    { key: 'border', label: 'Border colour', help: 'Dividers and outlines around controls and panels.' },
    { key: 'accent_text', label: 'Accent text colour', help: 'Text and icons on accent-coloured buttons.' },
  ];

  loading = signal(true);
  saving  = signal(false);
  error   = signal('');
  previewingTheme = signal(false);

  readonly sections: { id: SettingsSection; label: string }[] = [
    { id: 'branding',      label: 'Branding'                },
    { id: 'contact',       label: 'Contact Info'             },
    { id: 'hero',          label: 'Hero Carousel'            },
    { id: 'compatibility', label: 'Universal Compatibility'  },
  ];
  activeSection = signal<SettingsSection>('branding');

  heroSlides  = signal<HeroSlide[]>([]);
  brandLogos  = signal<BrandLogo[]>([]);
  businessHours = signal<BusinessHoursRow[]>([]);
  trustBar    = signal<TrustBarItem[]>([]);

  // Whether the lists above are still the built-in defaults (not yet an
  // explicit admin choice) — controls the "these are the current live
  // defaults" hint vs treating the list as a deliberately-saved override.
  usingDefaultSlides = signal(false);
  usingDefaultBrands = signal(false);
  usingDefaultContact = signal(false);
  usingDefaultTrustBar = signal(false);

  form = this.fb.nonNullable.group({
    logo_url:      [''],
    font_family: ['Inter', [Validators.required, oneOf(GOOGLE_FONT_OPTIONS)]],
    theme: this.fb.nonNullable.group({
      surface: [DEFAULT_SITE_THEME.surface, hexValidators],
      surface_raised: [DEFAULT_SITE_THEME.surface_raised, hexValidators],
      text: [DEFAULT_SITE_THEME.text, hexValidators],
      text_muted: [DEFAULT_SITE_THEME.text_muted, hexValidators],
      border: [DEFAULT_SITE_THEME.border, hexValidators],
      accent: [DEFAULT_SITE_THEME.accent, hexValidators],
      accent_text: [DEFAULT_SITE_THEME.accent_text, hexValidators],
      radius: this.fb.nonNullable.control<SiteTheme['radius']>('subtle', oneOf(['square', 'subtle', 'rounded'])),
      density: this.fb.nonNullable.control<SiteTheme['density']>('standard', oneOf(['compact', 'standard', 'spacious'])),
    }, { validators: themeContrastValidator }),
    contact_email:    ['', [Validators.required, Validators.email]],
    contact_phone:    [''],
    contact_whatsapp: [''],
    contact_location: [''],
    compat_note: [''],
  });

  private savedTheme = { font_family: 'Inter', theme: { ...DEFAULT_SITE_THEME } };

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      const s = await this.adminService.getSiteSettings();
      const contact = s.contact || {};
      const theme = normaliseSiteTheme(s);
      const hasContact = !!(contact.email || contact.phone || contact.location);
      const hasHours = !!(contact.business_hours && contact.business_hours.length);
      this.form.patchValue({
        logo_url: s.logo_url || '',
        font_family: s.font_family || 'Inter',
        theme,
        contact_email: contact.email || DEFAULT_CONTACT_INFO.email,
        contact_phone: contact.phone || '',
        contact_whatsapp: contact.whatsapp || '',
        contact_location: contact.location || DEFAULT_CONTACT_INFO.location,
        compat_note: s.compat_note || DEFAULT_COMPAT_NOTE,
      });
      this.savedTheme = {
        font_family: s.font_family || 'Inter',
        theme,
      };
      this.siteSettingsService.commit({ ...s, theme });
      this.businessHours.set(hasHours ? contact.business_hours : DEFAULT_CONTACT_INFO.business_hours.map(x => ({ ...x })));
      this.usingDefaultContact.set(!hasContact);

      const hasSlides = !!(s.hero_slides && s.hero_slides.length);
      const hasBrands = !!(s.brand_logos && s.brand_logos.length);
      const hasTrustBar = !!(s.trust_bar && s.trust_bar.length);
      this.heroSlides.set(hasSlides ? s.hero_slides : DEFAULT_HERO_SLIDES.map(x => ({ ...x })));
      this.brandLogos.set(hasBrands ? s.brand_logos : DEFAULT_BRAND_LOGOS.map(x => ({ ...x })));
      this.trustBar.set(hasTrustBar ? s.trust_bar : DEFAULT_TRUST_BAR.map(x => ({ ...x })));
      this.usingDefaultSlides.set(!hasSlides);
      this.usingDefaultBrands.set(!hasBrands);
      this.usingDefaultTrustBar.set(!hasTrustBar);
    } catch (e: unknown) {
      this.error.set((e instanceof Error ? e.message : '') || 'Failed to load site settings');
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.siteSettingsService.cancelPreview();
  }

  // ── Hero slides ────────────────────────────────────────────
  addHeroSlide(): void {
    this.usingDefaultSlides.set(false);
    this.heroSlides.update(list => [...list, { image_url: '', alt: '' }]);
  }

  updateHeroSlideImage(index: number, url: string): void {
    this.usingDefaultSlides.set(false);
    this.heroSlides.update(list => list.map((s, i) => i === index ? { ...s, image_url: url } : s));
  }

  updateHeroSlideAlt(index: number, alt: string): void {
    this.usingDefaultSlides.set(false);
    this.heroSlides.update(list => list.map((s, i) => i === index ? { ...s, alt } : s));
  }

  removeHeroSlide(index: number): void {
    this.usingDefaultSlides.set(false);
    this.heroSlides.update(list => list.filter((_, i) => i !== index));
  }

  moveHeroSlide(index: number, dir: -1 | 1): void {
    this.usingDefaultSlides.set(false);
    this.heroSlides.update(list => {
      const next = [...list];
      const target = index + dir;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  // ── Brand logos ────────────────────────────────────────────
  addBrandLogo(): void {
    this.usingDefaultBrands.set(false);
    this.brandLogos.update(list => [...list, { brand: '', model: '', logo_url: '' }]);
  }

  updateBrandLogoField(index: number, field: 'brand' | 'model', value: string): void {
    this.usingDefaultBrands.set(false);
    this.brandLogos.update(list => list.map((b, i) => i === index ? { ...b, [field]: value } : b));
  }

  updateBrandLogoImage(index: number, url: string): void {
    this.usingDefaultBrands.set(false);
    this.brandLogos.update(list => list.map((b, i) => i === index ? { ...b, logo_url: url } : b));
  }

  removeBrandLogo(index: number): void {
    this.usingDefaultBrands.set(false);
    this.brandLogos.update(list => list.filter((_, i) => i !== index));
  }

  // ── Trust bar ──────────────────────────────────────────────
  addTrustBarItem(): void {
    this.usingDefaultTrustBar.set(false);
    this.trustBar.update(list => [...list, { icon: 'check_circle', label: '' }]);
  }

  updateTrustBarField(index: number, field: 'icon' | 'label', value: string): void {
    this.usingDefaultTrustBar.set(false);
    this.trustBar.update(list => list.map((t, i) => i === index ? { ...t, [field]: value } : t));
  }

  removeTrustBarItem(index: number): void {
    this.usingDefaultTrustBar.set(false);
    this.trustBar.update(list => list.filter((_, i) => i !== index));
  }

  // ── Business hours ───────────────────────────────────────────
  addHoursRow(): void {
    this.usingDefaultContact.set(false);
    this.businessHours.update(list => [...list, { label: '', hours: '', closed: false }]);
  }

  updateHoursField(index: number, field: 'label' | 'hours', value: string): void {
    this.usingDefaultContact.set(false);
    this.businessHours.update(list => list.map((r, i) => i === index ? { ...r, [field]: value } : r));
  }

  toggleHoursClosed(index: number): void {
    this.usingDefaultContact.set(false);
    this.businessHours.update(list => list.map((r, i) => i === index ? { ...r, closed: !r.closed } : r));
  }

  removeHoursRow(index: number): void {
    this.usingDefaultContact.set(false);
    this.businessHours.update(list => list.filter((_, i) => i !== index));
  }

  private buildContactPayload() {
    return {
      email: this.form.value.contact_email || DEFAULT_CONTACT_INFO.email,
      phone: this.form.value.contact_phone || '',
      whatsapp: this.form.value.contact_whatsapp || '',
      location: this.form.value.contact_location || '',
      business_hours: this.businessHours(),
    };
  }

  // ── Live preview ───────────────────────────────────────────
  private buildThemePayload(): SiteTheme {
    const theme = this.form.controls.theme.getRawValue();
    // Focus is a safe derived colour; preview and save use this exact payload.
    return normaliseSiteTheme({ theme: { ...theme, version: 1, focus: '' } });
  }

  private buildSettingsPayload(): SiteSettings {
    const fields = this.form.getRawValue();
    const theme = this.buildThemePayload();
    return {
      logo_url: fields.logo_url || null,
      font_family: fields.font_family,
      theme,
      primary_color: theme.accent,
      background_color: theme.surface,
      font_color: theme.text,
      hero_slides: this.heroSlides().filter(slide => slide.image_url.trim()),
      brand_logos: this.brandLogos().filter(brand => brand.logo_url.trim() && brand.brand.trim()),
      trust_bar: this.trustBar().filter(item => item.label.trim()),
      compat_note: fields.compat_note || DEFAULT_COMPAT_NOTE,
      contact: {
        ...this.buildContactPayload(),
        business_hours: this.businessHours().filter(row => row.label.trim()),
      },
    };
  }

  previewTheme(): void {
    if (this.form.controls.theme.invalid || this.form.controls.font_family.invalid) {
      this.form.controls.theme.markAllAsTouched();
      this.form.controls.font_family.markAsTouched();
      return;
    }
    this.siteSettingsService.preview(this.buildSettingsPayload());
    this.previewingTheme.set(true);
  }

  resetThemePreview(): void {
    this.form.patchValue(this.savedTheme);
    this.siteSettingsService.cancelPreview();
    this.previewingTheme.set(false);
  }

  // ── Save ───────────────────────────────────────────────────
  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const updated: SiteSettings = await this.adminService.updateSiteSettings(this.buildSettingsPayload());
      const theme = normaliseSiteTheme(updated);
      const font_family = updated.font_family || 'Inter';
      this.form.patchValue({ font_family, theme });
      this.heroSlides.set(updated.hero_slides || []);
      this.brandLogos.set(updated.brand_logos || []);
      this.trustBar.set(updated.trust_bar || []);
      this.businessHours.set(updated.contact?.business_hours || []);
      this.savedTheme = { font_family, theme };
      this.previewingTheme.set(false);
      this.siteSettingsService.commit(updated);
      await this.modal.alert({ title: 'Saved', message: 'Site settings updated — changes are live on the storefront now.' });
    } catch (e: unknown) {
      const failure = e as { error?: { error?: string }; message?: string };
      await this.modal.alert({ title: 'Save Failed', message: failure?.error?.error || failure?.message || 'Unknown error', variant: 'danger' });
    } finally {
      this.saving.set(false);
    }
  }
}
