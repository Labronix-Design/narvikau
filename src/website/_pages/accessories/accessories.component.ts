import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule, DecimalPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { AccessoryService } from '../../_services/accessory.service';
import { CartService } from '../../_services/cart.service';
import { CategoryService } from '../../_services/category.service';
import { SiteSettingsService } from '../../_services/site-settings.service';
import { CatalogAccessory, PurchaseMode, resolveCatalogPurchaseMode } from '../../_models/catalog.models';
import { QuoteModalComponent } from '../../_components/quote-modal/quote-modal.component';

interface AccessoryGroup {
  category: string;
  label: string;
  eyebrow: string;
  icon: string;
  items: CatalogAccessory[];
}

@Component({
  selector: 'website-accessories',
  templateUrl: './accessories.component.html',
  styleUrls: ['./accessories.component.scss'],
  standalone: true,
  imports: [CommonModule, DecimalPipe, RouterModule, MatIconModule, QuoteModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccessoriesPage implements OnInit {
  readonly accessoryService = inject(AccessoryService);
  readonly cartService = inject(CartService);
  readonly categoryService = inject(CategoryService);
  readonly siteSettings = inject(SiteSettingsService);

  readonly addedSlugs = signal<Set<string>>(new Set());
  readonly quoteModalOpen = signal(false);
  readonly quoteModalProduct = signal('');

  readonly groups = computed<AccessoryGroup[]>(() => {
    const all = this.accessoryService.accessories();
    const map = new Map<string, CatalogAccessory[]>();
    for (const a of all) {
      const list = map.get(a.category) ?? [];
      list.push(a);
      map.set(a.category, list);
    }
    return Array.from(map.entries()).map(([cat, items]) => {
      const dbCat = this.categoryService.bySlug(cat);
      const meta = dbCat
        ? { label: dbCat.name, eyebrow: dbCat.eyebrow || 'Accessory', icon: dbCat.icon || 'extension' }
        : { label: cat.replace(/_/g, ' '), eyebrow: 'Accessory', icon: 'extension' };
      return { category: cat, ...meta, items };
    });
  });

  readonly hasAny = computed(() =>
    !this.accessoryService.loading() && !this.accessoryService.error() && this.accessoryService.accessories().length > 0
  );

  readonly isEmpty = computed(() =>
    !this.accessoryService.loading() && !this.accessoryService.error() && this.accessoryService.accessories().length === 0
  );

  readonly skeletons = [0, 1, 2, 3];

  ngOnInit(): void {
    window.scrollTo({ top: 0, behavior: 'instant' });
    this.accessoryService.load();
    this.categoryService.load();
  }

  addToCart(accessory: CatalogAccessory): void {
    if (this.purchaseMode(accessory) !== 'online_checkout') return;

    this.cartService.addToCart({
      slug: `accessory:${accessory.slug}`,
      heading: accessory.name,
      variants: [],
      accessories: [],
      tags: ['Accessory', accessory.category.replace(/_/g, ' ')],
      accentColor: this.siteSettings.settings().primary_color,
      image: accessory.image_url,
    });
    this.addedSlugs.update((slugs) => new Set([...slugs, accessory.slug]));
    setTimeout(() => {
      this.addedSlugs.update((slugs) => {
        const next = new Set(slugs);
        next.delete(accessory.slug);
        return next;
      });
    }, 2000);
  }

  isAdded(slug: string): boolean {
    return this.addedSlugs().has(slug);
  }

  /** A zero or absent read-model value means no public price is available. */
  listedPriceCents(accessory: CatalogAccessory): number | null {
    const cents = accessory.price_cents;
    return this.purchaseMode(accessory) === 'online_checkout' && Number.isSafeInteger(cents) && (cents ?? 0) > 0
      ? cents ?? null
      : null;
  }

  purchaseMode(accessory: CatalogAccessory): PurchaseMode {
    return resolveCatalogPurchaseMode(accessory.purchaseMode, accessory.price_cents);
  }

  hasOnlineCheckoutItems(): boolean {
    return this.accessoryService.accessories().some((accessory) => this.purchaseMode(accessory) === 'online_checkout');
  }

  categoryIcon(cat: string): string {
    return this.categoryService.bySlug(cat)?.icon || 'extension';
  }

  openQuoteModal(accessory: CatalogAccessory): void {
    this.quoteModalProduct.set(accessory.name);
    this.quoteModalOpen.set(true);
  }

  closeQuoteModal(): void {
    this.quoteModalOpen.set(false);
  }
}
