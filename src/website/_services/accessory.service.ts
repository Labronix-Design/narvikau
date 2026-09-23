import { Injectable, inject, signal, computed } from '@angular/core';
import { CatalogAccessory, CompatibilityRule } from '../_models/catalog.models';
import { StorefrontReadModelService } from './storefront-read-model.service';

export interface CompatibilityFilter {
  trayType?: 'standard' | 'premium' | null;
  productId?: number | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
}

@Injectable({ providedIn: 'root' })
export class AccessoryService {
  private storefront = inject(StorefrontReadModelService);

  private _accessories = signal<CatalogAccessory[]>([]);
  private _rules = signal<CompatibilityRule[]>([]);
  private _loading = signal(false);
  private _error = signal<string | null>(null);
  private _loaded = false;
  private loadingPromise: Promise<void> | null = null;

  readonly accessories = this._accessories.asReadonly();
  readonly rules = this._rules.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  readonly hasRules = computed(() => this._rules().length > 0);

  async load(): Promise<void> {
    if (this._loaded) return;
    if (!this.loadingPromise) this.loadingPromise = this.loadOnce();
    await this.loadingPromise;
  }

  private async loadOnce(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      await this.storefront.load();
      const model = this.storefront.model();
      if (!model) throw new Error(this.storefront.error() || 'Storefront content is unavailable');
      this._accessories.set(model.accessories);
      this._rules.set(model.compatibility);
      this._loaded = true;
    } catch (err) {
      console.error('AccessoryService load failed:', err);
      this._error.set('We are refreshing this information. Please try again shortly.');
    } finally {
      this._loading.set(false);
      this.loadingPromise = null;
    }
  }

  /**
   * Returns accessories compatible with the given filter.
   * A rule's null fields act as wildcards — they match any value.
   * If no rules are seeded yet, all accessories are returned as a fallback.
   */
  compatibleWith(filter: CompatibilityFilter): CatalogAccessory[] {
    const rules = this._rules();
    if (rules.length === 0) return this._accessories();

    const matchingIds = new Set<number>();

    for (const rule of rules) {
      const trayOk = !rule.tray_type || rule.tray_type === filter.trayType;
      const prodOk = !rule.product_id || rule.product_id === filter.productId;
      const makeOk = !rule.vehicle_make || rule.vehicle_make === filter.vehicleMake;
      const modelOk = !rule.vehicle_model || rule.vehicle_model === filter.vehicleModel;

      if (trayOk && prodOk && makeOk && modelOk) {
        matchingIds.add(rule.accessory_id);
      }
    }

    return this._accessories().filter(a => matchingIds.has(a.id));
  }

  byCategory(category: string): CatalogAccessory[] {
    return this._accessories().filter(a => a.category === category);
  }
}
