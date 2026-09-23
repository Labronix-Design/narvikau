import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { MainPage } from './main.component';
import { ToastService } from '../../_services/toast.service';
import { FeatureFlagsService } from '../../_services/feature-flags.service';
import { SiteSettingsService } from '../../_services/site-settings.service';
import { ProductService } from '../../_services/product.service';
import { CatalogProduct } from '../../_models/catalog.models';

describe('MainPage canopy quote funnel', () => {
  let fixture: ComponentFixture<MainPage>;
  const products = signal<CatalogProduct[]>([]);
  const productError = signal<string | null>(null);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MainPage],
      providers: [
        { provide: Router, useValue: { url: '/', parseUrl: () => ({ fragment: null }) } },
        { provide: ToastService, useValue: { showToast: jasmine.createSpy('showToast') } },
        { provide: FeatureFlagsService, useValue: { emailsEnabled: true } },
        {
          provide: SiteSettingsService,
          useValue: {
            resolved: signal(true),
            unavailable: signal(false),
            settings: signal({
              hero_slides: [], brand_logos: [], trust_bar: [], compat_note: '',
              contact: { email: 'sales@example.test' },
            }),
          },
        },
        { provide: ProductService, useValue: { products, loading: signal(false), error: productError, load: async () => undefined } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MainPage);
    products.set([]);
    productError.set(null);
  });

  it('shows the canopy catalogue with an exact named quote action and no retired ranges', () => {
    products.set([canopy()]);

    fixture.detectChanges();

    const quoteAction = fixture.nativeElement.querySelector<HTMLButtonElement>(
      '[data-quote-product="navrik-canopy-adventure"]',
    );
    const pageText = fixture.nativeElement.textContent as string;
    expect(quoteAction).not.toBeNull();
    expect(pageText).toContain('1 canopy in the current catalogue');
    expect(pageText).not.toContain('Bakkie trays');
    expect(pageText).not.toContain('Browse accessories');

    quoteAction?.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.qm-dialog')?.textContent).toContain('Navrik Canopy — Adventure');
  });

  it('clears a previous canopy when opening a general quote request', () => {
    fixture.componentInstance.openQuoteModal(canopy());
    fixture.componentInstance.openGeneralQuote();

    expect(fixture.componentInstance.quoteModalOpen).toBeTrue();
    expect(fixture.componentInstance.quoteModalProduct).toBe('');
  });
});

function canopy(): CatalogProduct {
  return {
    id: 1,
    slug: 'navrik-canopy-adventure',
    name: 'Navrik Canopy — Adventure',
    category: 'canopy',
    size: 'Adventure',
    color: 'black',
    description: null,
    image_url: null,
    sort_order: 1,
    gallery_urls: [],
    material: null,
    thickness: null,
    front_door_window: null,
    side_door: null,
    rear_door: null,
    vehicle_fit: null,
  };
}
