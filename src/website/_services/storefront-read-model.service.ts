import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CatalogProduct } from '../_models/catalog.models';
import { SiteSettings } from '../_models/site-settings.models';

export interface StorefrontReadModel {
  products: CatalogProduct[];
  settings: SiteSettings;
}

/**
 * One anonymous, immutable storefront document shared by the whole Angular
 * application. It is served from Netlify's tagged durable cache and is only
 * invalidated after a server-owned admin mutation; customers cannot refresh
 * it or trigger database work themselves.
 */
@Injectable({ providedIn: 'root' })
export class StorefrontReadModelService {
  private http = inject(HttpClient);
  private loaded = false;
  private loadingPromise: Promise<void> | null = null;

  readonly model = signal<StorefrontReadModel | null>(null);
  readonly error = signal<string | null>(null);

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loadingPromise ??= this.loadOnce();
    await this.loadingPromise;
  }

  private async loadOnce(): Promise<void> {
    this.error.set(null);
    try {
      const model = await firstValueFrom(this.http.get<StorefrontReadModel>('/api/catalog-storefront'));
      this.model.set(model);
      this.loaded = true;
    } catch (error) {
      console.error('StorefrontReadModelService load failed:', error);
      this.error.set('We are refreshing this information. Please try again shortly.');
    } finally {
      this.loadingPromise = null;
    }
  }
}
