import { Injectable, inject, signal } from '@angular/core';
import { CatalogCategory } from '../_models/catalog.models';
import { StorefrontReadModelService } from './storefront-read-model.service';

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private storefront = inject(StorefrontReadModelService);

  private _categories = signal<CatalogCategory[]>([]);
  private loaded = false;

  readonly categories = this._categories.asReadonly();

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      await this.storefront.load();
      const model = this.storefront.model();
      if (!model) throw new Error('Storefront content is unavailable');
      this._categories.set(model.categories);
    } catch (err) {
      console.error('CategoryService load failed:', err);
    }
  }

  bySlug(slug: string): CatalogCategory | undefined {
    return this._categories().find(c => c.slug === slug);
  }
}
