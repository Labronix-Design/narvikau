import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ProductsPage } from './products.component';
import { ProductService } from '../../_services/product.service';
import { SiteSettingsService } from '../../_services/site-settings.service';
import { FeatureFlagsService } from '../../_services/feature-flags.service';
import { ToastService } from '../../_services/toast.service';
import { CatalogProduct } from '../../_models/catalog.models';

describe('ProductsPage canopy quotes', () => {
  let fixture: ComponentFixture<ProductsPage>;
  const products = signal<CatalogProduct[]>([]);
  const loading = signal(false);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductsPage],
      providers: [
        {
          provide: ProductService,
          useValue: {
            products, loading, error: signal(null), load: async () => undefined,
          },
        },
        { provide: SiteSettingsService, useValue: { settings: signal({ contact: { email: 'sales@example.test' } }) } },
        { provide: FeatureFlagsService, useValue: { emailsEnabled: true } },
        { provide: ToastService, useValue: { showToast: jasmine.createSpy('showToast') } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ProductsPage);
    products.set([]);
    loading.set(false);
  });

  it('renders an exact named quote action for every canopy without checkout copy', () => {
    products.set([canopy({
      id: 1,
      slug: 'navrik-canopy-adventure',
      name: 'Navrik Canopy — Adventure',
      size: 'Adventure',
    })]);

    fixture.detectChanges();

    const quoteAction = fixture.nativeElement.querySelector<HTMLButtonElement>(
      '[data-quote-product="navrik-canopy-adventure"]',
    );
    expect(quoteAction).not.toBeNull();
    expect(quoteAction?.getAttribute('aria-label')).toContain('Navrik Canopy — Adventure');
    expect((fixture.nativeElement.textContent as string).toLowerCase()).not.toContain('checkout');

    quoteAction?.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.qm-dialog')?.textContent).toContain('Navrik Canopy — Adventure');
  });

  it('does not manufacture a product image when the catalogue omits one', () => {
    expect(fixture.componentInstance.heroImage(canopy())).toBe('');
  });

  it('renders a fixed-navigation-safe hero and dimensioned loading cards', () => {
    loading.set(true);
    fixture.detectChanges();

    const hero = fixture.nativeElement.querySelector<HTMLElement>('.listing-hero');
    const skeletonImage = fixture.nativeElement.querySelector<HTMLElement>('.skeleton-img');
    const skeletonBody = fixture.nativeElement.querySelector<HTMLElement>('.skeleton-body');

    expect(hero).not.toBeNull();
    expect(Number.parseFloat(getComputedStyle(hero!).paddingTop)).toBeGreaterThan(72);
    expect(skeletonImage).not.toBeNull();
    expect(skeletonImage!.getBoundingClientRect().height).toBeGreaterThan(0);
    expect(skeletonBody).not.toBeNull();
  });
});

function canopy(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
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
    ...overrides,
  };
}
