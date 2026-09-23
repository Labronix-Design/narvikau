import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { MainPage } from './main.component';
import { ToastService } from '../../_services/toast.service';
import { FeatureFlagsService } from '../../_services/feature-flags.service';
import { PromoService } from '../../_services/promo.service';
import { SiteSettingsService } from '../../_services/site-settings.service';
import { ProductService } from '../../_services/product.service';
import { AccessoryService } from '../../_services/accessory.service';
import { CatalogAccessory, CatalogProduct } from '../../_models/catalog.models';

describe('MainPage quote-only catalogue funnel', () => {
  let fixture: ComponentFixture<MainPage>;
  const products = signal<CatalogProduct[]>([]);
  const accessories = signal<CatalogAccessory[]>([]);
  const productError = signal<string | null>(null);
  const accessoryError = signal<string | null>(null);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MainPage],
      providers: [
        { provide: Router, useValue: { url: '/', parseUrl: () => ({ fragment: null }) } },
        { provide: ToastService, useValue: { showToast: jasmine.createSpy('showToast') } },
        { provide: FeatureFlagsService, useValue: { emailsEnabled: true } },
        { provide: PromoService, useValue: { status: signal(null), load: async () => undefined } },
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
        { provide: AccessoryService, useValue: { accessories, loading: signal(false), error: accessoryError, load: async () => undefined } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MainPage);
    products.set([]);
    accessories.set([]);
    productError.set(null);
    accessoryError.set(null);
  });

  it('opens a quote request from the home card for the exact quote-only product', () => {
    products.set([{
      id: 1, slug: 'quote-canopy', name: 'Quote canopy', category: 'canopy', tray_type: null, size: null,
      color: '', base_price: 0, coating_cost: 0, base_price_cents: 0, purchaseMode: 'quote_only',
      description: 'Built around your vehicle.', image_url: null, sort_order: 0, gallery_urls: [],
      material: null, thickness: null, front_door_window: null, side_door: null, rear_door: null, vehicle_fit: null,
    }]);

    fixture.detectChanges();

    const quoteAction = fixture.nativeElement.querySelector<HTMLButtonElement>('[data-quote-product="quote-canopy"]');
    expect(quoteAction).withContext('home cards must not make quote-only shoppers hunt for a quote route').not.toBeNull();
    quoteAction?.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.qm-dialog')?.textContent).toContain('Quote canopy');
  });

  it('keeps live catalogue categories distinct while making every category count visible', () => {
    products.set([
      {
        id: 1, slug: 'canopy-one', name: 'Canopy One', category: 'canopy', tray_type: null, size: null,
        color: '', base_price: 0, coating_cost: 0, base_price_cents: 0, purchaseMode: 'quote_only',
        description: null, image_url: null, sort_order: 2, gallery_urls: [], material: null, thickness: null,
        front_door_window: null, side_door: null, rear_door: null, vehicle_fit: null,
      },
      {
        id: 2, slug: 'canopy-two', name: 'Canopy Two', category: 'canopy', tray_type: null, size: null,
        color: '', base_price: 0, coating_cost: 0, base_price_cents: 0, purchaseMode: 'quote_only',
        description: null, image_url: null, sort_order: 3, gallery_urls: [], material: null, thickness: null,
        front_door_window: null, side_door: null, rear_door: null, vehicle_fit: null,
      },
      {
        id: 3, slug: 'tray-one', name: 'Tray One', category: 'tray', tray_type: 'standard', size: null,
        color: '', base_price: 0, coating_cost: 0, base_price_cents: 0, purchaseMode: 'quote_only',
        description: null, image_url: null, sort_order: 1, gallery_urls: [], material: null, thickness: null,
        front_door_window: null, side_door: null, rear_door: null, vehicle_fit: null,
      },
    ]);
    accessories.set([
      {
        id: 4, slug: 'toolbox-one', name: 'Toolbox One', category: 'toolbox', price: 0,
        price_cents: 0, purchaseMode: 'quote_only', description: null, image_url: null, sort_order: 0,
      },
    ]);

    fixture.detectChanges();

    const categoryHeadings = Array.from(fixture.nativeElement.querySelectorAll<HTMLElement>('.category-title'))
      .map((heading) => heading.textContent?.trim());
    expect(categoryHeadings).toEqual(['Canopies', 'Bakkie trays', 'Accessories']);
    expect(fixture.nativeElement.textContent).toContain('2 items in the current catalogue');
    expect(fixture.nativeElement.textContent).toContain('1 item in the current catalogue');
    expect(fixture.nativeElement.querySelectorAll('.cat-card')).toHaveSize(3);
  });

  it('clears a prior card selection for a general homepage quote request', () => {
    const component = fixture.componentInstance;
    component.openQuoteModal({ name: 'Previously selected canopy' });
    component.openGeneralQuote();

    expect(component.quoteModalOpen).toBeTrue();
    expect(component.quoteModalProduct).toBe('');
  });

  it('shows a refresh state instead of an empty catalogue when a public read fails', () => {
    productError.set('We are refreshing this information. Please try again shortly.');

    fixture.detectChanges();

    const pageText = fixture.nativeElement.textContent as string;
    expect(pageText).toContain('We are refreshing this information');
    expect(pageText).not.toContain('Products are being prepared');
  });

  it('keeps the configured hero image in a full-stage media layer behind the quote action', () => {
    fixture.detectChanges();

    const stage = fixture.nativeElement.querySelector<HTMLElement>('.hero-media-stage');
    const copy = fixture.nativeElement.querySelector<HTMLElement>('.hero-copy-panel');

    expect(stage).withContext('the product image should occupy the hero stage, not a side column').not.toBeNull();
    expect(copy).withContext('the hero copy must remain available above the full image').not.toBeNull();
    expect(copy?.previousElementSibling)
      .withContext('the quote copy must layer immediately after the full hero media stage')
      .toBe(stage);
  });
});
