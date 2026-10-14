import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MainPage } from './main.component';
import { ToastService } from '../../_services/toast.service';
import { FeatureFlagsService } from '../../_services/feature-flags.service';
import { SiteSettingsService } from '../../_services/site-settings.service';
import { ProductService } from '../../_services/product.service';
import { CatalogProduct } from '../../_models/catalog.models';
import { AnalyticsService } from '../../_services/analytics.service';
import { StorefrontReadModelService } from '../../_services/storefront-read-model.service';
import { CatalogCategory } from '../../_models/catalog.models';

describe('MainPage canopy quote funnel', () => {
  let fixture: ComponentFixture<MainPage>;
  let analytics: jasmine.SpyObj<AnalyticsService>;
  const products = signal<CatalogProduct[]>([]);
  const productError = signal<string | null>(null);
  const categories = signal<CatalogCategory[]>([{ id: 1, slug: 'canopy', name: 'Canopies', description: null, sort_order: 0 }]);

  beforeEach(async () => {
    analytics = jasmine.createSpyObj<AnalyticsService>('AnalyticsService', ['trackMetaLead']);
    await TestBed.configureTestingModule({
      imports: [MainPage],
      providers: [
        { provide: Router, useValue: { url: '/', parseUrl: () => ({ fragment: null }) } },
        { provide: ToastService, useValue: { showToast: jasmine.createSpy('showToast') } },
        { provide: AnalyticsService, useValue: analytics },
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
        { provide: StorefrontReadModelService, useValue: { model: computed(() => ({ categories: categories() })) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MainPage);
    products.set([]);
    productError.set(null);
    categories.set([{ id: 1, slug: 'canopy', name: 'Canopies', description: null, sort_order: 0 }]);
  });

  it('builds a featured lane from each published category with products', () => {
    categories.set([
      { id: 1, slug: 'canopy', name: 'Canopies', description: null, sort_order: 0 },
      { id: 2, slug: 'roof-equipment', name: 'Roof Equipment', description: 'Carry more gear', sort_order: 1 },
    ]);
    products.set([canopy(), { ...canopy(), id: 2, slug: 'roof-rack', name: 'Roof Rack', category: 'roof-equipment' }]);
    fixture.detectChanges();
    expect(fixture.componentInstance.catalogueCategories().map(category => category.label)).toEqual(['Canopies', 'Roof Equipment']);
    expect(fixture.nativeElement.textContent).toContain('Roof Equipment');
  });

  it('shows the canopy catalogue with an exact named quote action and no retired ranges', () => {
    products.set([canopy()]);

    fixture.detectChanges();

    const quoteAction = fixture.nativeElement.querySelector<HTMLButtonElement>(
      '[data-quote-product="navrik-canopy-adventure"]',
    );
    const pageText = fixture.nativeElement.textContent as string;
    expect(quoteAction).not.toBeNull();
    expect(pageText).toContain('1 product in the current catalogue');
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

  it('submits the partner contract and records a Meta Lead only after success', async () => {
    const component = fixture.componentInstance;
    component.SubmitForm.setValue({ Name: 'Alex', BusinessName: 'Alex Motors', EnquiryType: 'dealer_enquiry', Phone: '0412345678', Email: 'alex@example.test', Message: 'Please confirm fitment.', Location: { state: 'Victoria', suburb: 'Richmond' }, DiscoverySource: 'Google Search', DiscoverySourceDetail: '' });
    const request = spyOn(window, 'fetch').and.resolveTo(new Response('', { status: 200 }));

    await component.onSubmit();

    expect(analytics.trackMetaLead).toHaveBeenCalledTimes(1);
    const [url, init] = request.calls.mostRecent().args;
    expect(url).toBe('/api/partner-email');
    const payload = JSON.parse(init?.body as string);
    expect(payload).toEqual(jasmine.objectContaining({ BusinessName: 'Alex Motors', EnquiryType: 'dealer_enquiry', LocationState: 'Victoria', LocationSuburb: 'Richmond', DiscoverySource: 'Google Search' }));
    expect(payload.Surname).toBeUndefined();
    expect(payload.Location).toBeUndefined();
  });

  it('does not record a Meta Lead when its homepage contact form fails', async () => {
    const component = fixture.componentInstance;
    component.SubmitForm.setValue({ Name: 'Alex', BusinessName: 'Alex Motors', EnquiryType: 'dealer_enquiry', Phone: '0412345678', Email: 'alex@example.test', Message: 'Please confirm fitment.', Location: { state: 'Victoria', suburb: 'Richmond' }, DiscoverySource: 'Google Search', DiscoverySourceDetail: '' });
    spyOn(window, 'fetch').and.resolveTo(new Response('', { status: 500 }));

    await component.onSubmit();

    expect(analytics.trackMetaLead).not.toHaveBeenCalled();
    expect(component.SubmitForm.controls.BusinessName.value).toBe('Alex Motors');
  });

  it('does not submit an incomplete partner business or type', async () => {
    const component = fixture.componentInstance;
    const request = spyOn(window, 'fetch');
    component.SubmitForm.patchValue({ Name: 'Alex', Phone: '0412345678', Email: 'alex@example.test', Message: 'Partner application', Location: { state: 'Victoria', suburb: 'Richmond' }, DiscoverySource: 'Google Search' });
    await component.onSubmit();
    expect(request).not.toHaveBeenCalled();
    component.SubmitForm.patchValue({ BusinessName: 'Alex Motors' });
    await component.onSubmit();
    expect(request).not.toHaveBeenCalled();
    expect(analytics.trackMetaLead).not.toHaveBeenCalled();
  });
});

function canopy(): CatalogProduct {
  return {
    id: 1,
    slug: 'navrik-canopy-adventure',
    name: 'Navrik Canopy — Adventure',
    category: 'canopy',
    specifications: {},
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
