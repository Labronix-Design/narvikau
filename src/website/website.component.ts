import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, PLATFORM_ID } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { filter } from 'rxjs';
import { NavigationEnd, Event, Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer, Meta, Title } from '@angular/platform-browser';
import { MatIconRegistry } from '@angular/material/icon';

// Components
import { ToastComponent } from './_components/toast/toast.component';
import { NavbarComponent } from './_components/navbar/navbar.component';
import { FooterComponent } from './_components/footer/footer.component';
import { AnalyticsConsentComponent } from './_components/analytics-consent/analytics-consent.component';

// Services & Data
import { GoogleReviewsService } from './_services/google.service';
import { PerformanceService } from './_services/performance.service';
import { SiteSettingsService } from './_services/site-settings.service';
import { APP_ICONS } from '../assets/icons/icon-registry';

interface PublicPageMetadata {
  title: string;
  description: string;
}

const SITE_ORIGIN = 'https://www.navrik.co.za';
const CONFIGURED_FAVICON_SELECTOR = 'link[data-navrik-configured-favicon]';
const CONFIGURED_ORGANIZATION_SCHEMA_SELECTOR = 'script[data-navrik-configured-organization]';

/**
 * Site settings are admin-managed data, but still validate the URL before it
 * reaches document metadata. Relative upload paths resolve to Navrik's public
 * origin; external assets must use HTTPS. This deliberately rejects data,
 * javascript, and credential-bearing URLs.
 */
export function configuredLogoMetadataUrl(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const url = new URL(value.trim(), SITE_ORIGIN);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Social metadata needs Navrik's canonical public URL, while the browser's
 * favicon should load from the current origin. Keeping those responsibilities
 * separate avoids a local-preview CSP violation without weakening validation
 * or changing the value Google receives.
 */
export function configuredLogoDocumentUrl(
  value: string | null | undefined,
  documentOrigin: string,
): string | null {
  if (!configuredLogoMetadataUrl(value) || typeof value !== 'string') return null;

  try {
    const url = new URL(value.trim(), documentOrigin);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

const PUBLIC_PAGE_METADATA: Readonly<Record<string, PublicPageMetadata>> = {
  '/': {
    title: 'Navrik Australia | Aluminium Canopies',
    description: 'Explore Navrik aluminium canopies for Australian vehicles and request a tailored quote.',
  },
  '/products': {
    title: 'Aluminium Canopies | Navrik Australia',
    description: 'Browse the current Navrik aluminium canopy range and request guidance for your vehicle.',
  },
  '/contact': {
    title: 'Contact Navrik | Product Guidance & Quotes',
    description: 'Contact Navrik for product guidance, fitment information and a tailored quote.',
  },
  '/refund-policy': {
    title: 'Refund & Warranty Policy | Navrik',
    description: 'Read Navrik’s refund and warranty policy for aluminium canopies.',
  },
  '/privacy': {
    title: 'Privacy Notice | Navrik',
    description: 'Read how Navrik handles personal information submitted through this website.',
  },
  '/terms': {
    title: 'Terms of Service | Navrik',
    description: 'Read the terms governing use of the Navrik website and product enquiries.',
  },
};

@Component({
  selector: 'website-root',
  imports: [RouterModule, ToastComponent, NavbarComponent, FooterComponent, AnalyticsConsentComponent],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<website-toast></website-toast>
<website-navbar></website-navbar>

<main id="content" class="main-content" [class.has-settings-alert]="siteSettings.unavailable()">
  @if (siteSettings.unavailable()) {
    <aside class="site-settings-unavailable" aria-live="polite">
      We are refreshing this information. Please try again shortly.
    </aside>
  }
  <router-outlet></router-outlet>
</main>

<website-footer></website-footer>
<website-analytics-consent></website-analytics-consent>
  `
})
export class WebsiteComponent implements OnInit {
  private router = inject(Router);
  private googleService = inject(GoogleReviewsService);
  private iconRegistry = inject(MatIconRegistry);
  private sanitizer = inject(DomSanitizer);
  private perfService = inject(PerformanceService);
  private platformId = inject(PLATFORM_ID);
  private meta = inject(Meta);
  private title = inject(Title);
  private document = inject(DOCUMENT);
  private destroyRef = inject(DestroyRef);
  siteSettings = inject(SiteSettingsService);

  constructor() {
    this.perfService.init();
    this.registerIcons();
    void this.siteSettings.load().then(() => this.updateSearchMetadata(this.router.url));
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(event => {
      this.handleNavigation(event);
      this.googleService.trackPageChange(event.urlAfterRedirects);
      this.updateSearchMetadata(event.urlAfterRedirects);
    });
  }

  private registerIcons(): void {
    Object.entries(APP_ICONS).forEach(([key, svg]) => {
      this.iconRegistry.addSvgIconLiteral(
        key,
        this.sanitizer.bypassSecurityTrustHtml(svg)
      );
    });
  }

  ngOnInit(): void {
    this.updateSearchMetadata(this.router.url);
  }

  private handleNavigation(event: Event): void {
    if (event instanceof NavigationEnd) {
      if (isPlatformBrowser(this.platformId)) {
        document.body.style.overflow = '';
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;          // Safari fallback
        window.scrollTo(0, 0);
      }
    }
  }

  /**
   * Public pages retain canonical, descriptive search metadata. Admin routes are
   * deliberately excluded from AEO/SEO: no canonical is exposed and bots are
   * asked not to index, follow, or cache them.
   */
  private updateSearchMetadata(url: string): void {
    const pathname = url.split(/[?#]/)[0] || '/';
    const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
    const canonical = `${SITE_ORIGIN}${pathname === '/' ? '/' : pathname.replace(/\/$/, '')}`;

    this.meta.updateTag({
      name: 'robots',
      content: isAdminRoute ? 'noindex, nofollow, noarchive' : 'index, follow',
    });

    const existingCanonical = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (isAdminRoute) {
      existingCanonical?.remove();
      this.removeConfiguredBrandMetadata();
      return;
    }

    const canonicalLink = existingCanonical ?? this.document.createElement('link');
    canonicalLink.rel = 'canonical';
    canonicalLink.href = canonical;
    if (!existingCanonical) this.document.head.appendChild(canonicalLink);

    const metadata = this.publicMetadata(pathname);
    this.title.setTitle(metadata.title);
    this.meta.updateTag({ name: 'description', content: metadata.description });
    this.meta.updateTag({ property: 'og:title', content: metadata.title });
    this.meta.updateTag({ property: 'og:url', content: canonical });
    this.meta.updateTag({ property: 'og:description', content: metadata.description });
    this.meta.updateTag({ name: 'twitter:title', content: metadata.title });
    this.meta.updateTag({ name: 'twitter:description', content: metadata.description });
    this.updateConfiguredBrandMetadata();
  }

  /** Applies the admin-configured logo to browser-only social and favicon metadata. */
  private updateConfiguredBrandMetadata(): void {
    const configuredLogoUrl = this.siteSettings.settings().logo_url;
    const logoUrl = configuredLogoMetadataUrl(configuredLogoUrl);
    if (!logoUrl) {
      this.removeConfiguredBrandMetadata();
      return;
    }

    this.meta.updateTag({ property: 'og:image', content: logoUrl });
    this.meta.updateTag({ property: 'og:image:alt', content: 'Navrik logo' });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:image', content: logoUrl });

    const favicon = this.document.head.querySelector<HTMLLinkElement>(CONFIGURED_FAVICON_SELECTOR)
      ?? this.document.createElement('link');
    favicon.rel = 'icon';
    // Unlike the canonical OG/schema value above, resolve a relative upload
    // against the live document so localhost previews remain same-origin.
    favicon.href = configuredLogoDocumentUrl(configuredLogoUrl, this.document.location.origin) ?? logoUrl;
    favicon.setAttribute('data-navrik-configured-favicon', '');
    if (!favicon.isConnected) this.document.head.appendChild(favicon);

    this.updateConfiguredOrganizationSchema(logoUrl);
  }

  /**
   * The static document cannot safely know the database-managed logo. Add one
   * marked graph only after the validated setting is available, so Google sees
   * the exact same mark as browser and social metadata.
   */
  private updateConfiguredOrganizationSchema(logoUrl: string): void {
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${SITE_ORIGIN}/#organization`,
      name: 'Navrik',
      url: `${SITE_ORIGIN}/`,
      logo: logoUrl,
    };
    const script = this.document.head.querySelector<HTMLScriptElement>(CONFIGURED_ORGANIZATION_SCHEMA_SELECTOR)
      ?? this.document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(schema);
    script.setAttribute('data-navrik-configured-organization', '');
    if (!script.isConnected) this.document.head.appendChild(script);
  }

  /** Removes image metadata rather than retaining a previous or deleted logo. */
  private removeConfiguredBrandMetadata(): void {
    this.document.head
      .querySelectorAll('meta[property="og:image"], meta[property="og:image:alt"], meta[name="twitter:image"]')
      .forEach((tag) => tag.remove());
    this.meta.updateTag({ name: 'twitter:card', content: 'summary' });
    this.document.head.querySelector<HTMLLinkElement>(CONFIGURED_FAVICON_SELECTOR)?.remove();
    this.document.head.querySelector<HTMLScriptElement>(CONFIGURED_ORGANIZATION_SCHEMA_SELECTOR)?.remove();
  }

  private publicMetadata(pathname: string): PublicPageMetadata {
    if (pathname.startsWith('/products/')) {
      return {
        title: 'Aluminium Canopy Details | Navrik Australia',
        description: 'View Navrik aluminium canopy details, then request tailored guidance for your vehicle.',
      };
    }
    return PUBLIC_PAGE_METADATA[pathname] ?? PUBLIC_PAGE_METADATA['/'];
  }
}
