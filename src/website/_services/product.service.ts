import { Injectable, inject, signal } from '@angular/core';
import { CatalogProduct } from '../_models/catalog.models';
import { StorefrontReadModelService } from './storefront-read-model.service';

@Injectable({ providedIn: 'root' })
export class ProductService {
  private storefront = inject(StorefrontReadModelService);

  private _products = signal<CatalogProduct[]>([]);
  private _loading = signal(false);
  private _error = signal<string | null>(null);
  private _loaded = false;
  private loadingPromise: Promise<void> | null = null;

  readonly products = this._products.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  async load(): Promise<void> {
    if (this._loaded) return;
    if (!this.loadingPromise) this.loadingPromise = this.loadOnce();
    await this.loadingPromise;
  }

  bySlug(slug: string): CatalogProduct | undefined {
    return this._products().find(p => p.slug === slug);
  }

  private async loadOnce(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      await this.storefront.load();
      const model = this.storefront.model();
      if (!model) throw new Error(this.storefront.error() || 'Storefront content is unavailable');
      this._products.set(model.products);
      this._loaded = true;
    } catch (err) {
      console.error('ProductService load failed:', err);
      this._error.set('We are refreshing this information. Please try again shortly.');
    } finally {
      this._loading.set(false);
      this.loadingPromise = null;
    }
  }

  byCategory(category: string): CatalogProduct[] {
    return this._products().filter(p => p.category === category);
  }

  byTrayType(trayType: 'standard' | 'premium'): CatalogProduct[] {
    return this._products().filter(p => p.tray_type === trayType);
  }
}
