import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ProductsPage } from './products.component';
import { ProductService } from '../../_services/product.service';
import { SiteSettingsService } from '../../_services/site-settings.service';
import { FeatureFlagsService } from '../../_services/feature-flags.service';
import { ToastService } from '../../_services/toast.service';
import { CategoryService } from '../../_services/category.service';
import { CatalogProduct, resolveCatalogPurchaseMode } from '../../_models/catalog.models';

describe('ProductsPage catalogue data', () => {
  let fixture: ComponentFixture<ProductsPage>;
  const products = signal<CatalogProduct[]>([]);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductsPage],
      providers: [
        {
          provide: ProductService,
          useValue: {
            products, loading: signal(false), error: signal(null), load: async () => undefined,
          },
        },
        { provide: SiteSettingsService, useValue: { settings: signal({ contact: { email: 'sales@example.test' } }) } },
        { provide: FeatureFlagsService, useValue: { emailsEnabled: true } },
        { provide: ToastService, useValue: { showToast: jasmine.createSpy('showToast') } },
        { provide: CategoryService, useValue: { bySlug: () => undefined, load: async () => undefined } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ProductsPage);
    products.set([]);
  });

  it('does not manufacture a product image when the public catalogue omits one', () => {
    const image = fixture.componentInstance.heroImage({
      id: 1, slug: 'catalogue-item', name: 'Catalogue item', category: 'tray', tray_type: 'standard', size: null,
      color: '', base_price: 0, coating_cost: 0, description: null, image_url: null, sort_order: 0,
      gallery_urls: [], material: null, thickness: null, front_door_window: null, side_door: null, rear_door: null, vehicle_fit: null,
    });

    expect(image).toBe('');
  });

  it('treats a zero or missing cached price as quote-only', () => {
    const product = {
      id: 1, slug: 'catalogue-item', name: 'Catalogue item', category: 'tray' as const, tray_type: 'standard' as const, size: null,
      color: '', base_price: 0, coating_cost: 0, description: null, image_url: null, sort_order: 0,
      gallery_urls: [], material: null, thickness: null, front_door_window: null, side_door: null, rear_door: null, vehicle_fit: null,
    };

    expect(fixture.componentInstance.listedPriceCents(product)).toBeNull();
    expect(fixture.componentInstance.listedPriceCents({ ...product, base_price_cents: 0 })).toBeNull();
    expect(fixture.componentInstance.listedPriceCents({ ...product, base_price_cents: 125000 })).toBe(125000);
  });

  it('fails closed when an online checkout mode has no positive integer-cent price', () => {
    expect(resolveCatalogPurchaseMode('online_checkout', undefined)).toBe('quote_only');
    expect(resolveCatalogPurchaseMode('online_checkout', 0)).toBe('quote_only');
    expect(resolveCatalogPurchaseMode('online_checkout', -1)).toBe('quote_only');
    expect(resolveCatalogPurchaseMode('online_checkout', 1999.5)).toBe('quote_only');
    expect(resolveCatalogPurchaseMode('online_checkout', 125000)).toBe('online_checkout');
    expect(resolveCatalogPurchaseMode(undefined, 125000)).toBe('online_checkout');
    expect(resolveCatalogPurchaseMode(null, 125000)).toBe('quote_only');
    expect(resolveCatalogPurchaseMode(undefined, 0)).toBe('quote_only');
  });

  it('opens a quote request for the exact quote-only catalogue product', () => {
    products.set([{
      id: 1, slug: 'quote-tray', name: 'Quote tray', category: 'tray', tray_type: 'standard', size: null,
      color: '', base_price: 0, coating_cost: 0, base_price_cents: 0, purchaseMode: 'quote_only',
      description: 'Configured to your vehicle.', image_url: null, sort_order: 0, gallery_urls: [],
      material: null, thickness: null, front_door_window: null, side_door: null, rear_door: null, vehicle_fit: null,
    }]);

    fixture.detectChanges();

    const quoteAction = fixture.nativeElement.querySelector<HTMLButtonElement>('[data-quote-product="quote-tray"]');
    expect(quoteAction).withContext('quote-only cards need a direct, named quote action').not.toBeNull();
    quoteAction?.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.qm-dialog')?.textContent).toContain('Quote tray');
  });
});
