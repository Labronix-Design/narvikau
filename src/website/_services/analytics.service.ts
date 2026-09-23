import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type AnalyticsConsent = 'unknown' | 'granted' | 'denied';

interface AnalyticsConfiguration {
  enabled: boolean;
  measurementId: string | null;
}

interface AnalyticsWindow extends Window {
  dataLayer?: IArguments[];
  gtag?: (...args: unknown[]) => void;
  [key: string]: unknown;
}

const CONSENT_STORAGE_KEY = 'navrik.analytics-consent.v1';
const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/;

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private http = inject(HttpClient);
  private document = inject(DOCUMENT);
  private platformId = inject(PLATFORM_ID);
  private measurementId: string | null = null;
  private loadPromise: Promise<void> | null = null;

  readonly consent = signal<AnalyticsConsent>(this.readConsent());

  async grant(): Promise<void> {
    this.setConsent('granted');
    if (this.isCurrentAdminRoute()) return;
    await this.ensureLoaded();
    await this.trackPageView(this.document.location?.href ?? '/');
  }

  deny(): void {
    this.setConsent('denied');
    this.disableAnalytics();
  }

  async trackPageView(url: string): Promise<void> {
    if (this.consent() !== 'granted' || this.isAdminRoute(url)) return;

    await this.ensureLoaded();
    if (!this.measurementId || !isPlatformBrowser(this.platformId)) return;

    this.gtag('event', 'page_view', {
      page_path: this.publicPath(url),
      page_title: this.document.title,
    });
  }

  async trackEvent(name: string, parameters: Record<string, unknown> = {}): Promise<void> {
    if (this.consent() !== 'granted' || this.isAdminRoute(this.document.location?.pathname ?? '')) return;

    await this.ensureLoaded();
    if (this.measurementId) this.gtag('event', name, parameters);
  }

  private async ensureLoaded(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || this.consent() !== 'granted' || this.measurementId || this.isCurrentAdminRoute()) return;

    this.loadPromise ??= this.loadConfiguration();
    await this.loadPromise;
  }

  private async loadConfiguration(): Promise<void> {
    try {
      const config = await firstValueFrom(this.http.get<AnalyticsConfiguration>('/api/public-analytics-config'));
      const measurementId = config.enabled ? config.measurementId?.trim().toUpperCase() : null;
      if (!measurementId || !MEASUREMENT_ID_PATTERN.test(measurementId) || this.consent() !== 'granted' || this.isCurrentAdminRoute()) return;

      this.measurementId = measurementId;
      this.installTag(measurementId);
    } catch {
      // Analytics is optional: a transient configuration failure must never affect the storefront.
    }
  }

  private installTag(measurementId: string): void {
    if (this.isCurrentAdminRoute()) return;

    const windowRef = this.analyticsWindow();
    windowRef.dataLayer ??= [];
    windowRef.gtag ??= function(this: unknown, ..._args: unknown[]): void {
      windowRef.dataLayer?.push(arguments);
    };

    this.gtag('consent', 'default', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    this.gtag('consent', 'update', { analytics_storage: 'granted' });
    this.gtag('js', new Date());
    this.gtag('config', measurementId, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });

    if (!this.document.head.querySelector(`script[data-navrik-analytics="${measurementId}"]`)) {
      const script = this.document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
      script.dataset['navrikAnalytics'] = measurementId;
      this.document.head.appendChild(script);
    }
  }

  private disableAnalytics(): void {
    if (!isPlatformBrowser(this.platformId) || !this.measurementId) return;

    const windowRef = this.analyticsWindow();
    windowRef[`ga-disable-${this.measurementId}`] = true;
    this.gtag('consent', 'update', { analytics_storage: 'denied' });
    this.clearGoogleAnalyticsCookies();
  }

  private clearGoogleAnalyticsCookies(): void {
    const expires = 'expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax';
    for (const cookie of this.document.cookie.split(';')) {
      const name = cookie.trim().split('=')[0];
      if (name === '_ga' || name.startsWith('_ga_')) {
        this.document.cookie = `${name}=; ${expires}`;
      }
    }
  }

  private gtag(...args: unknown[]): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.analyticsWindow().gtag?.(...args);
  }

  private setConsent(consent: Exclude<AnalyticsConsent, 'unknown'>): void {
    this.consent.set(consent);
    if (isPlatformBrowser(this.platformId)) localStorage.setItem(CONSENT_STORAGE_KEY, consent);
  }

  private readConsent(): AnalyticsConsent {
    if (!isPlatformBrowser(this.platformId)) return 'unknown';
    const value = localStorage.getItem(CONSENT_STORAGE_KEY);
    return value === 'granted' || value === 'denied' ? value : 'unknown';
  }

  private isAdminRoute(url: string): boolean {
    const pathname = this.publicPath(url);
    return pathname === '/admin' || pathname.startsWith('/admin/');
  }

  private isCurrentAdminRoute(): boolean {
    return this.isAdminRoute(this.document.location?.pathname ?? '');
  }

  private publicPath(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      try {
        return new URL(url).pathname || '/';
      } catch {
        return '/';
      }
    }
    return url.split(/[?#]/)[0] || '/';
  }

  private analyticsWindow(): AnalyticsWindow {
    return window as unknown as AnalyticsWindow;
  }
}
