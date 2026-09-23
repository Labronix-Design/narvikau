import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ProductDetailPage } from './product-detail.component';
import { ProductService } from '../../../_services/product.service';
import { AccessoryService } from '../../../_services/accessory.service';
import { CartService } from '../../../_services/cart.service';
import { SiteSettingsService } from '../../../_services/site-settings.service';
import { FeatureFlagsService } from '../../../_services/feature-flags.service';
import { CatalogAccessory, CatalogProduct, CatalogProductVariant } from '../../../_models/catalog.models';

describe('ProductDetailPage purchase modes', () => {
  let fixture: ComponentFixture<ProductDetailPage>;
  const products = signal<CatalogProduct[]>([]);
  const compatibleAccessories = signal<CatalogAccessory[]>([]);
  const addToCart = jasmine.createSpy('addToCart');

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductDetailPage],
      providers: [
        {
          provide: ProductService,
          useValue: {
            products, loading: signal(false), error: signal(null), load: async () => undefined,
            bySlug: (slug: string) => products().find((product) => product.slug === slug),
          },
        },
        {
          provide: AccessoryService,
          useValue: {
            accessories: signal([]), loading: signal(false), error: signal(null), load: async () => undefined,
            compatibleWith: () => compatibleAccessories(),
          },
        },
        { provide: CartService, useValue: { addToCart } },
        { provide: SiteSettingsService, useValue: { settings: signal({ primary_color: '#ea580c', contact: { email: 'sales@example.test' } }) } },
        { provide: FeatureFlagsService, useValue: { emailsEnabled: true } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'quote-product' } } } },
        { provide: Router, useValue: { navigate: async () => true } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductDetailPage);
    products.set([]);
    compatibleAccessories.set([]);
    addToCart.calls.reset();
  });

  it('shows only a quote request and refuses cart additions for quote-only products', async () => {
    const product = {
      id: 1, slug: 'quote-product', name: 'Quote product', category: 'tray' as const, tray_type: 'standard' as const,
      size: null, color: '', base_price: 1999, base_price_cents: 199900, coating_cost: 0, coating_cost_cents: 0,
      purchaseMode: 'quote_only' as const, description: 'Built to fit your vehicle.', image_url: null, sort_order: 0,
      gallery_urls: [], material: 'Aluminium', thickness: null, front_door_window: null, side_door: null, rear_door: null, vehicle_fit: null,
    } as CatalogProduct & { purchaseMode: 'quote_only' };
    products.set([product]);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    fixture.componentInstance.addToCart();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Request a quote');
    expect(text).not.toContain('Add selection to cart');
    expect(text).not.toContain('Price confirmed securely at checkout');
    expect(addToCart).not.toHaveBeenCalled();
  });

  it('passes selected variants and accessories to a quote request', async () => {
    const variant: CatalogProductVariant = {
      id: 9, variant_type: 'finish', variant_value: 'black', label: 'Black powder coat', price_delta_cents: 0, sort_order: 0,
    };
    const product = {
      id: 1, slug: 'quote-product', name: 'Quote product', category: 'tray' as const, tray_type: 'standard' as const,
      size: null, color: '', base_price: 0, coating_cost: 0, description: null, image_url: null, sort_order: 0,
      purchaseMode: 'quote_only' as const, gallery_urls: [], material: null, thickness: null, front_door_window: null,
      side_door: null, rear_door: null, vehicle_fit: null, variants: [variant],
    } as CatalogProduct;
    const accessory: CatalogAccessory = {
      id: 4, slug: 'rear-guard', name: 'Rear guard', category: 'rear_guard', price: 0, price_cents: 0,
      purchaseMode: 'quote_only', description: null, image_url: null, sort_order: 0,
    };
    products.set([product]);
    compatibleAccessories.set([accessory]);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.selectVariant('finish', variant);
    fixture.componentInstance.toggleAccessory(accessory.id);

    expect(fixture.componentInstance.quoteConfiguration()).toEqual({
      variants: [{ label: 'Finish', value: 'Black powder coat' }],
      accessories: ['Rear guard'],
    });
  });
});
