import { AfterViewInit, ChangeDetectionStrategy, Component, DOCUMENT, HostListener, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule, Router } from '@angular/router';
import { ToastService } from '../../_services/toast.service';
import { TextInputComponent } from '../../_components/text-input/text-input.component';
import { ButtonComponent } from '../../_components/button/button.component';
import { QuoteModalComponent } from '../../_components/quote-modal/quote-modal.component';
import { ImageLoaderComponent } from '../../_components/image-loader/image-loader.component';
import { FeatureFlagsService } from '../../_services/feature-flags.service';
import { SiteSettingsService } from '../../_services/site-settings.service';
import { ProductService } from '../../_services/product.service';
import { CatalogProduct } from '../../_models/catalog.models';
import { DEFAULT_HERO_SLIDES, DEFAULT_BRAND_LOGOS, DEFAULT_TRUST_BAR, DEFAULT_COMPAT_NOTE } from '../../_models/site-settings.models';

interface HomeCatalogueCard {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  badge: string | null;
  detailRoute: readonly string[];
}

interface HomeCatalogueCategory {
  key: 'canopy';
  label: string;
  eyebrow: string;
  count: number;
  featured: HomeCatalogueCard;
  browseRoute: readonly string[];
}

@Component({
  selector: 'website-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, ReactiveFormsModule, MatIconModule, RouterModule,
    TextInputComponent, ButtonComponent, QuoteModalComponent, ImageLoaderComponent
  ],
})
export class MainPage implements OnInit, AfterViewInit {
  private router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);

  submitted = false;
  isLoading = false;
  readonly SubmitForm = this.fb.nonNullable.group({
    Name: ['', Validators.required],
    Surname: ['', Validators.required],
    Phone: ['', Validators.required],
    Email: ['', [Validators.required, Validators.email]],
    Message: ['', Validators.required],
  });
  public flags = inject(FeatureFlagsService);
  siteSettings = inject(SiteSettingsService);
  readonly productService = inject(ProductService);

  /** The complete product cache, kept for any surrounding UI that needs it. */
  readonly catalogueProducts = computed(() => [...this.productService.products()]
    .sort((left, right) => left.sort_order - right.sort_order));

  /**
   * The home page highlights one live canopy while keeping the complete range
   * available on the dedicated catalogue page.
   */
  readonly catalogueCategories = computed<HomeCatalogueCategory[]>(() => {
    const products = this.catalogueProducts();
    const featured = products[0];
    return featured ? [{
      key: 'canopy',
      label: 'Canopies',
      eyebrow: 'Built for Australian conditions',
      count: products.length,
      featured: this.toHomeProductCard(featured),
      browseRoute: ['/products'],
    }] : [];
  });

  /** A partial catalogue is less useful than an honest availability state. */
  readonly catalogueUnavailable = computed(() =>
    !!this.productService.error()
  );

  // Carousel — used whenever the admin hasn't configured hero slides yet.
  readonly carouselImages = computed(() => {
    const slides = this.siteSettings.settings().hero_slides;
    return (slides.length ? slides : DEFAULT_HERO_SLIDES).map(s => s.image_url);
  });
  /** A preload is only valid once settings confirm the static fallback is in use. */
  readonly usesDefaultHero = computed(() =>
    this.siteSettings.resolved() && this.siteSettings.settings().hero_slides.length === 0
  );
  currentSlide = signal(0);
  /** Kept out of the hero so it becomes a useful return-to-catalogue action, not a duplicate CTA. */
  readonly showCatalogueFloat = signal(false);

  quoteModalOpen = false;
  quoteModalProduct = '';

  // Used whenever the admin hasn't configured compatible-vehicle brand logos yet.
  readonly compatibleBrands = computed(() => {
    const logos = this.siteSettings.settings().brand_logos;
    return (logos.length ? logos : DEFAULT_BRAND_LOGOS)
      .map(b => ({ brand: b.brand, model: b.model, logo: b.logo_url }));
  });

  // Used whenever the admin hasn't configured the trust-bar labels yet.
  readonly trustBar = computed(() => {
    const items = this.siteSettings.settings().trust_bar;
    return items.length ? items : DEFAULT_TRUST_BAR;
  });

  readonly compatNote = computed(() => this.siteSettings.settings().compat_note || DEFAULT_COMPAT_NOTE);

  readonly coreValues = computed(() => {
    return [
      { title: 'Canopy Fitment Support', desc: 'Talk to our team about vehicle fit, installation and the right canopy for your intended use.', icon: 'handyman' },
      { title: 'Warranty Support', desc: 'Register your Navrik canopy and keep your product details together for future support.', icon: 'verified' },
      { title: 'Australian Enquiries', desc: 'Product guidance for Australian vehicles, conditions and touring requirements.', icon: 'local_shipping' },
    ];
  });

  readonly heroStats = [
    { label: 'Structural Warranty',  value: '24-Month',  icon: 'verified' },
    { label: 'Compatible Models',    value: '7+',        icon: 'directions_car' },
    { label: 'Aluminium Thickness',  value: '2.5mm',     icon: 'build' },
  ];

  ngOnInit(): void {
    void this.productService.load();
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      // Only the current hero image is rendered and requested on first paint.
      const fragment = this.router.parseUrl(this.router.url).fragment;
      if (fragment) {
        setTimeout(() => {
          const el = document.getElementById(fragment);
          if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - 72, behavior: 'smooth' });
        }, 400);
      } else {
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      }
    }
  }

  prevSlide(): void {
    this.currentSlide.update(s => (s - 1 + this.carouselImages().length) % this.carouselImages().length);
  }

  nextSlide(): void {
    this.currentSlide.update(s => (s + 1) % this.carouselImages().length);
  }

  goToSlide(index: number): void {
    this.currentSlide.set(index);
  }

  @HostListener('window:scroll')
  onWindowScroll(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const catalogue = document.getElementById('catalogue');
    const top = catalogue?.offsetTop ?? Number.POSITIVE_INFINITY;
    const bottom = top + (catalogue?.offsetHeight ?? 0);
    // The persistent action should help visitors reach the range, never cover
    // the cards or their quote action while they are already browsing it.
    const browsingCatalogue = window.scrollY + window.innerHeight * 0.4 >= top && window.scrollY <= bottom;
    this.showCatalogueFloat.set(window.scrollY > window.innerHeight * 0.62 && !browsingCatalogue);
  }

  // ── Quote modal ────────────────────────────────────────────────────────────
  openQuoteModal(product: Pick<CatalogProduct, 'name'>): void {
    this.quoteModalProduct = product.name;
    this.quoteModalOpen = true;
  }

  openGeneralQuote(): void {
    // Clearing the bound value lets the dialog describe this accurately as a
    // general catalogue enquiry rather than retaining a previous card choice.
    this.quoteModalProduct = '';
    this.quoteModalOpen = true;
  }

  closeQuoteModal(): void {
    this.quoteModalOpen = false;
  }

  /**
   * Catalogue cards never render wider than a single grid column. Serve an
   * uploaded image at that display size through Netlify's image CDN instead
   * of making a mobile visitor download the original upload. External image
   * URLs remain untouched because Netlify only owns local uploads.
   */
  catalogueCardImage(imageUrl: string | null): string {
    if (!imageUrl || !imageUrl.startsWith('/uploads/')) return imageUrl ?? '';
    const source = new URL(imageUrl, this.document.baseURI).href;
    return `/.netlify/images?url=${encodeURIComponent(source)}&w=640`;
  }

  private toHomeProductCard(product: CatalogProduct): HomeCatalogueCard {
    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      imageUrl: product.image_url,
      badge: product.size,
      detailRoute: ['/products', product.slug],
    };
  }

  scrollTo(id: string, event?: Event): void {
    if (event) event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }

  async onSubmit(): Promise<void> {
    this.submitted = true;
    if (this.SubmitForm.invalid) {
      this.toast.showToast({ message: 'Please complete all required fields.', type: 'error' });
      return;
    }
    this.isLoading = true;
    try {
      const response = await fetch('/api/contact-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.SubmitForm.value)
      });
      if (response.ok) {
        this.SubmitForm.reset();
        this.submitted = false;
        this.isLoading = false;
        this.toast.showToast({ message: 'Request submitted! Our team will be in touch.', type: 'success' });
      } else {
        throw new Error('Failed');
      }
    } catch {
      setTimeout(() => {
        this.SubmitForm.reset();
        this.submitted = false;
        this.isLoading = false;
        this.toast.showToast({ message: `Submission failed — please email us directly at ${this.siteSettings.settings().contact.email}`, type: 'error' });
      }, 1500);
    }
  }

}
