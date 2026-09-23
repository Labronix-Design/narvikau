import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ProductDetailPage } from './product-detail.component';
import { ProductService } from '../../../_services/product.service';
import { SiteSettingsService } from '../../../_services/site-settings.service';
import { FeatureFlagsService } from '../../../_services/feature-flags.service';
import { CatalogProduct } from '../../../_models/catalog.models';

describe('ProductDetailPage canopy quotes', () => {
  let fixture: ComponentFixture<ProductDetailPage>;
  const products = signal<CatalogProduct[]>([]);

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
        { provide: SiteSettingsService, useValue: { settings: signal({ contact: { email: 'sales@example.test' } }) } },
        { provide: FeatureFlagsService, useValue: { emailsEnabled: true } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'navrik-canopy-adventure' } } } },
        { provide: Router, useValue: { navigate: async () => true } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductDetailPage);
    products.set([]);
  });

  it('shows a named quote action and no cart, payment, variant, or accessory controls', async () => {
    products.set([canopy()]);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const pageText = (fixture.nativeElement.textContent as string).toLowerCase();
    const quoteAction = fixture.nativeElement.querySelector<HTMLButtonElement>(
      '[data-quote-product="navrik-canopy-adventure"]',
    );
    expect(quoteAction).not.toBeNull();
    expect(quoteAction?.getAttribute('aria-label')).toContain('Navrik Canopy — Adventure');
    expect(pageText).not.toContain('cart');
    expect(pageText).not.toContain('checkout');
    expect(pageText).not.toContain('payment');
    expect(pageText).not.toContain('compatible accessories');

    quoteAction?.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.qm-dialog')?.textContent).toContain('Navrik Canopy — Adventure');
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
    description: 'Built around your vehicle.',
    image_url: null,
    sort_order: 1,
    gallery_urls: [],
    material: 'Aluminium',
    thickness: null,
    front_door_window: null,
    side_door: null,
    rear_door: null,
    vehicle_fit: null,
  };
}
