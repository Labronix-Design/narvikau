import {
  Component,
  ElementRef,
  ViewChild,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  NgZone,
  inject,
  signal,
  DestroyRef,
  afterNextRender,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, NavigationEnd, RouterModule } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AsyncPipe, CommonModule } from '@angular/common';
import { CartService } from '../../_services/cart.service';
import { SiteSettingsService } from '../../_services/site-settings.service';
import { ProductService } from '../../_services/product.service';
import { AccessoryService } from '../../_services/accessory.service';
import { MatIconModule } from '@angular/material/icon';

type ShopCategory = 'tray' | 'canopy' | 'accessory' | 'custom-made-tray-and-canopy-combo';

interface CataloguePreview {
  url: string;
  alt: string;
}

@Component({
  selector: 'website-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, AsyncPipe],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NavbarComponent implements OnInit, OnDestroy {
  @ViewChild('navElement') navElement!: ElementRef;

  public router = inject(Router);
  public cartService = inject(CartService);
  public siteSettings = inject(SiteSettingsService);
  public productService = inject(ProductService);
  public accessoryService = inject(AccessoryService);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);
  private destroyRef = inject(DestroyRef);

  cartCount$ = this.cartService.getCartItemCount();

  currentFragment: string | null = null;
  isMenuOpen = false;
  shopOpen = false;
  private readonly failedPreviewUrls = signal<ReadonlySet<string>>(new Set());

  private readonly NAV_HEIGHT = 72;
  // Prevents the scroll listener from interfering while a nav-click smooth scroll is in progress
  private isProgrammaticScroll = false;
  private programmaticScrollTimer: any;
  private scrollListener: (() => void) | null = null;
  private documentClickListener: (() => void) | null = null;

  constructor() {
    afterNextRender(() => {
      this.setupScrollListener();
      this.setupDocumentClickListener();
      // Set initial active section after DOM settles
      setTimeout(() => this.handleScrollLogic(), 350);
    });
  }

  ngOnInit(): void {
    void this.productService.load();
    void this.accessoryService.load();
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => {
      if (!this.isProgrammaticScroll) {
        this.detectActiveRoute(true);
      }
      this.closeNavbar();
      this.ngZone.run(() => this.cdr.markForCheck());
    });
    this.detectActiveRoute(false);
  }

  shopSummary(category: ShopCategory): string {
    const count = category === 'accessory'
      ? this.accessoryService.accessories().length
      : this.productService.products().filter((product) => product.category === category).length;
    return count ? `${count} published item${count === 1 ? '' : 's'}` : 'Browse the published catalogue';
  }

  /**
   * Dropdown media is deliberately selected from the same cached public
   * catalogue the catalogue pages render. No product name, image, or local
   * asset is baked into the shell, so an admin update is reflected here after
   * the cache refresh as well.
   */
  shopPreview(category: ShopCategory): CataloguePreview | null {
    const item = category === 'accessory'
      ? this.accessoryService.accessories().find((accessory) => Boolean(accessory.image_url?.trim()))
      : this.productService.products().find((product) => product.category === category && Boolean(this.productImage(product)));

    if (!item) return null;

    const url = category === 'accessory'
      ? item.image_url?.trim() ?? ''
      : this.productImage(item);

    if (!url || this.failedPreviewUrls().has(url)) return null;
    return { url, alt: item.name };
  }

  onPreviewImageError(url: string): void {
    this.failedPreviewUrls.update((failedUrls) => new Set([...failedUrls, url]));
  }

  ngOnDestroy(): void {
    this.cleanupListeners();
    document.body.style.overflow = '';
    if (this.programmaticScrollTimer) clearTimeout(this.programmaticScrollTimer);
  }

  private detectActiveRoute(shouldScroll: boolean): void {
    const urlTree = this.router.parseUrl(this.router.url);
    const path = this.router.url.split('#')[0].split('?')[0];
    const isHome = path === '/' || path === '';
    if (isHome) {
      this.currentFragment = urlTree.fragment ?? null;
      if (this.currentFragment && shouldScroll) {
        this.scrollToSection(this.currentFragment);
      }
    } else {
      this.currentFragment = null;
    }
    this.cdr.markForCheck();
  }

  private setupScrollListener(): void {
    this.ngZone.runOutsideAngular(() => {
      let scrollTimeout: any;
      const onScroll = () => {
        if (this.shopOpen) {
          this.ngZone.run(() => {
            this.shopOpen = false;
            this.cdr.markForCheck();
          });
        }
        if (this.isMenuOpen) return;
        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          this.handleScrollLogic();
          scrollTimeout = null;
        }, 30);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      this.scrollListener = () => {
        window.removeEventListener('scroll', onScroll);
        if (scrollTimeout) clearTimeout(scrollTimeout);
      };
    });
  }

  private setupDocumentClickListener(): void {
    const onClick = (event: MouseEvent) => {
      if (this.navElement && !this.navElement.nativeElement.contains(event.target)) {
        if (this.isMenuOpen || this.shopOpen) {
          this.ngZone.run(() => {
            this.closeAll();
          });
        }
      }
    };
    document.addEventListener('click', onClick);
    this.documentClickListener = () => document.removeEventListener('click', onClick);
  }

  private cleanupListeners(): void {
    if (this.scrollListener) this.scrollListener();
    if (this.documentClickListener) this.documentClickListener();
  }

  private handleScrollLogic(): void {
    if (this.isProgrammaticScroll) return;

    const path = this.router.url.split('#')[0].split('?')[0];
    if (path !== '/' && path !== '') return;

    // Active = last section whose top has scrolled up to/past the 35% threshold.
    // Works reliably for tall sections and instant direction changes.
    const sections = ['home', 'trays', 'contact'];
    const threshold = window.innerHeight * 0.35;
    let found = 'home';

    for (const id of sections) {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top <= threshold) {
        found = id;
      }
    }

    if (found !== this.currentFragment) {
      this.currentFragment = found;
      window.history.replaceState(null, '', `/#${found}`);
      this.ngZone.run(() => this.cdr.markForCheck());
    }
  }

  onNavClick(fragment: string, event?: Event): void {
    if (event) event.preventDefault();
    this.closeNavbar();
    document.body.style.overflow = '';

    this.currentFragment = fragment;
    this.cdr.markForCheck();

    this.isProgrammaticScroll = true;
    if (this.programmaticScrollTimer) clearTimeout(this.programmaticScrollTimer);
    this.programmaticScrollTimer = setTimeout(() => { this.isProgrammaticScroll = false; }, 700);

    const path = this.router.url.split('#')[0].split('?')[0];
    const alreadyHome = path === '/' || path === '';

    if (alreadyHome) {
      window.history.replaceState(null, '', `/#${fragment}`);
      const el = document.getElementById(fragment);
      if (el) {
        const top = el.getBoundingClientRect().top + window.pageYOffset - this.NAV_HEIGHT;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    } else {
      this.router.navigate(['/'], { replaceUrl: true }).then(() => {
        this.scrollToSection(fragment);
      });
    }
  }

  // Used only for initial page load with a fragment in the URL (needs retry for dynamic content)
  private scrollToSection(id: string, retries = 3): void {
    setTimeout(() => {
      const element = document.getElementById(id);
      if (element) {
        const top = element.getBoundingClientRect().top + window.pageYOffset - this.NAV_HEIGHT;
        window.scrollTo({ top, behavior: 'smooth' });
      } else if (retries > 0) {
        this.scrollToSection(id, retries - 1);
      }
    }, 300);
  }

  isShopActive(): boolean {
    return this.router.url.startsWith('/products') || this.router.url.startsWith('/accessories');
  }

  toggleShop(event: Event): void {
    event.stopPropagation();
    this.shopOpen = !this.shopOpen;
    this.cdr.markForCheck();
  }

  closeAll(): void {
    this.isMenuOpen = false;
    this.shopOpen = false;
    document.body.style.overflow = '';
    this.cdr.markForCheck();
  }

  toggleNavbar(): void {
    this.isMenuOpen = !this.isMenuOpen;
    if (!this.isMenuOpen) this.shopOpen = false;
    document.body.style.overflow = this.isMenuOpen ? 'hidden' : '';
    this.cdr.markForCheck();
  }

  closeNavbar(): void {
    if (!this.isMenuOpen) return;
    this.isMenuOpen = false;
    this.shopOpen = false;
    document.body.style.overflow = '';
    this.cdr.markForCheck();
  }

  private productImage(product: { image_url: string | null; gallery_urls?: string[] }): string {
    return [product.image_url, ...(product.gallery_urls ?? [])]
      .find((url): url is string => Boolean(url?.trim()))?.trim() ?? '';
  }
}
