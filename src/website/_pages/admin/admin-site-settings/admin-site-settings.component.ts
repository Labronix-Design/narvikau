import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AdminService } from '../../../_services/admin.service';
import { ModalService } from '../../../_services/modal.service';
import { SiteSettingsService } from '../../../_services/site-settings.service';
import { ImageUploadComponent } from '../../../_components/image-upload/image-upload.component';
import {
  HeroSlide, BrandLogo, BusinessHoursRow, TrustBarItem, GOOGLE_FONT_OPTIONS,
  DEFAULT_HERO_SLIDES, DEFAULT_BRAND_LOGOS, DEFAULT_CONTACT_INFO,
  DEFAULT_TRUST_BAR, DEFAULT_COMPAT_NOTE,
} from '../../../_models/site-settings.models';

type SettingsSection = 'branding' | 'contact' | 'hero' | 'compatibility';

@Component({
  selector: 'website-admin-site-settings',
  templateUrl: './admin-site-settings.component.html',
  styleUrls: ['./admin-site-settings.component.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, ImageUploadComponent],
})
export class AdminSiteSettingsComponent implements OnInit {
  private adminService = inject(AdminService);
  private modal = inject(ModalService);
  private siteSettingsService = inject(SiteSettingsService);
  private fb = inject(FormBuilder);

  readonly fontOptions = GOOGLE_FONT_OPTIONS;

  loading = signal(true);
  saving  = signal(false);
  error   = signal('');

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
    font_family:   ['Inter', Validators.required],
    primary_color: ['#ea580c', [Validators.required, Validators.pattern(/^#[0-9a-fA-F]{6}$/)]],
    contact_email:    ['', [Validators.required, Validators.email]],
    contact_phone:    [''],
    contact_whatsapp: [''],
    contact_location: [''],
    compat_note: [''],
  });

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      const s = await this.adminService.getSiteSettings();
      const contact = s.contact || {};
      const hasContact = !!(contact.email || contact.phone || contact.location);
      const hasHours = !!(contact.business_hours && contact.business_hours.length);
      this.form.patchValue({
        logo_url: s.logo_url || '',
        font_family: s.font_family || 'Inter',
        primary_color: s.primary_color || '#ea580c',
        contact_email: contact.email || DEFAULT_CONTACT_INFO.email,
        contact_phone: contact.phone || '',
        contact_whatsapp: contact.whatsapp || '',
        contact_location: contact.location || DEFAULT_CONTACT_INFO.location,
        compat_note: s.compat_note || DEFAULT_COMPAT_NOTE,
      });
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
    } catch (e: any) {
      this.error.set(e.message || 'Failed to load site settings');
    } finally {
      this.loading.set(false);
    }
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
  previewTheme(): void {
    this.siteSettingsService.apply({
      logo_url: this.form.value.logo_url || null,
      font_family: this.form.value.font_family || 'Inter',
      primary_color: this.form.value.primary_color || '#ea580c',
      hero_slides: this.heroSlides(),
      brand_logos: this.brandLogos(),
      trust_bar: this.trustBar(),
      compat_note: this.form.value.compat_note || DEFAULT_COMPAT_NOTE,
      contact: this.buildContactPayload(),
    });
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
      const payload = {
        logo_url: this.form.value.logo_url || null,
        font_family: this.form.value.font_family!,
        primary_color: this.form.value.primary_color!,
        hero_slides: this.heroSlides().filter(s => s.image_url.trim()),
        brand_logos: this.brandLogos().filter(b => b.logo_url.trim() && b.brand.trim()),
        trust_bar: this.trustBar().filter(t => t.label.trim()),
        compat_note: this.form.value.compat_note || DEFAULT_COMPAT_NOTE,
        contact: {
          ...this.buildContactPayload(),
          business_hours: this.businessHours().filter(r => r.label.trim()),
        },
      };
      const updated = await this.adminService.updateSiteSettings(payload as any);
      this.heroSlides.set(updated.hero_slides || []);
      this.brandLogos.set(updated.brand_logos || []);
      this.trustBar.set(updated.trust_bar || []);
      this.businessHours.set(updated.contact?.business_hours || []);
      this.siteSettingsService.apply(updated);
      await this.modal.alert({ title: 'Saved', message: 'Site settings updated — changes are live on the storefront now.' });
    } catch (e: any) {
      await this.modal.alert({ title: 'Save Failed', message: e.error?.error || e.message || 'Unknown error', variant: 'danger' });
    } finally {
      this.saving.set(false);
    }
  }
}
