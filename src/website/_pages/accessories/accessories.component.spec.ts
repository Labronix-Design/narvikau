import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AccessoriesPage } from './accessories.component';
import { AccessoryService } from '../../_services/accessory.service';
import { CartService } from '../../_services/cart.service';
import { CategoryService } from '../../_services/category.service';
import { SiteSettingsService } from '../../_services/site-settings.service';
import { FeatureFlagsService } from '../../_services/feature-flags.service';
import { ToastService } from '../../_services/toast.service';
import { CatalogAccessory } from '../../_models/catalog.models';

describe('AccessoriesPage catalogue pricing', () => {
  let fixture: ComponentFixture<AccessoriesPage>;
  const accessories = signal<CatalogAccessory[]>([]);
  const addToCart = jasmine.createSpy('addToCart');

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccessoriesPage],
      providers: [
        { provide: AccessoryService, useValue: { accessories, loading: signal(false), error: signal(null), load: async () => undefined } },
        { provide: CartService, useValue: { addToCart } },
        { provide: CategoryService, useValue: { bySlug: () => undefined, load: async () => undefined } },
        { provide: SiteSettingsService, useValue: { settings: signal({ primary_color: '#ea580c' }) } },
        { provide: FeatureFlagsService, useValue: { emailsEnabled: true } },
        { provide: ToastService, useValue: { showToast: jasmine.createSpy('showToast') } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AccessoriesPage);
    accessories.set([]);
    addToCart.calls.reset();
  });

  it('treats a zero or missing cached price as quote-only', () => {
    const accessory = { id: 1, slug: 'catalogue-item', name: 'Catalogue item', category: 'toolbox', price: 0, description: null, image_url: null, sort_order: 0 } as CatalogAccessory;

    expect(fixture.componentInstance.listedPriceCents(accessory)).toBeNull();
    expect(fixture.componentInstance.listedPriceCents({ ...accessory, price_cents: 0 })).toBeNull();
    expect(fixture.componentInstance.listedPriceCents({ ...accessory, price_cents: 125000 })).toBe(125000);
  });

  it('shows only the quote action and rejects cart additions for quote-only accessories', () => {
    const accessory = {
      id: 1, slug: 'quote-accessory', name: 'Quote accessory', category: 'toolbox' as const,
      price: 1999, price_cents: 199900, purchaseMode: 'quote_only' as const,
      description: 'Fitment is reviewed before pricing.', image_url: null, sort_order: 0,
    } as CatalogAccessory & { purchaseMode: 'quote_only' };
    accessories.set([accessory]);

    fixture.detectChanges();
    fixture.componentInstance.addToCart(accessory);

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Request a quote');
    expect(text).not.toContain('Add to Cart');
    expect(addToCart).not.toHaveBeenCalled();
  });

  it('opens a quote request for the exact quote-only accessory', () => {
    const accessory = {
      id: 1, slug: 'quote-toolbox', name: 'Quote toolbox', category: 'toolbox' as const,
      price: 0, price_cents: 0, purchaseMode: 'quote_only' as const,
      description: 'Sized to your build.', image_url: null, sort_order: 0,
    } as CatalogAccessory;
    accessories.set([accessory]);

    fixture.detectChanges();

    const quoteAction = fixture.nativeElement.querySelector<HTMLButtonElement>('[data-quote-accessory="quote-toolbox"]');
    expect(quoteAction).withContext('quote-only accessories need a direct, named quote action').not.toBeNull();
    quoteAction?.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.qm-dialog')?.textContent).toContain('Quote toolbox');
  });
});
