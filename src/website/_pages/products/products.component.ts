import { ChangeDetectionStrategy, Component, computed, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { CommonModule, DecimalPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ProductService } from '../../_services/product.service';
import { SiteSettingsService } from '../../_services/site-settings.service';
import { CatalogProduct, PurchaseMode, resolveCatalogPurchaseMode } from '../../_models/catalog.models';
import { QuoteModalComponent } from '../../_components/quote-modal/quote-modal.component';
import { CategoryService } from '../../_services/category.service';

interface ProductGroup {
  key: string;
  label: string;
  eyebrow: string;
  items: CatalogProduct[];
}

const PRODUCT_CATEGORY_COPY: Record<string, Pick<ProductGroup, 'label' | 'eyebrow'>> = {
  'custom-made-tray-and-canopy-combo': {
    label: 'Custom Made Tray and Canopy Combo',
    eyebrow: 'Built for your bakkie',
  },
};

// Old links used 'tray-standard' / 'tray-premium' — keep them working as aliases for the unified 'tray' filter.
const normalizeFilter = (raw: string | null): string | null =>
  raw === 'tray-standard' || raw === 'tray-premium' ? 'tray' : raw;

@Component({
  selector: 'website-products',
  templateUrl: './products.component.html',
  styleUrls: ['./products.component.scss'],
  standalone: true,
  imports: [CommonModule, DecimalPipe, RouterModule, MatIconModule, QuoteModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductsPage implements OnInit {
  productService = inject(ProductService);
  siteSettings = inject(SiteSettingsService);
  categoryService = inject(CategoryService);
  private route = inject(ActivatedRoute);

  activeCategory = signal<string | null>(null);
  readonly quoteModalOpen = signal(false);
  readonly quoteModalProduct = signal('');

  readonly groups = computed<ProductGroup[]>(() => {
    const all = this.productService.products();
    const filter = normalizeFilter(this.activeCategory());

    const result: ProductGroup[] = [];

    // Canopies first
    const canopyItems = all.filter(p => p.category === 'canopy');
    if (canopyItems.length > 0 && (!filter || filter === 'canopy')) {
      result.push({ key: 'canopy', label: 'Canopies', eyebrow: 'Complete Your Build', items: canopyItems });
    }

    // Trays second — one unified group (Standard/Premium shown per-card, not split into sections)
    const trayItems = all.filter(p => p.category === 'tray');
    if (trayItems.length > 0 && (!filter || filter === 'tray')) {
      result.push({ key: 'tray', label: 'Bakkie Trays', eyebrow: 'Precision Engineered', items: trayItems });
    }

    // Any other categories — accessories third, alphabetical fallback for future additions
    const otherItems = all.filter(p => p.category !== 'tray' && p.category !== 'canopy' && (!filter || p.category === filter));
    const catMap = new Map<string, CatalogProduct[]>();
    for (const p of otherItems) {
      const list = catMap.get(p.category) ?? [];
      list.push(p);
      catMap.set(p.category, list);
    }
    for (const [cat, items] of catMap.entries()) {
      const categoryCopy = PRODUCT_CATEGORY_COPY[cat];
      result.push({
        key: cat,
        label: categoryCopy?.label ?? (cat.charAt(0).toUpperCase() + cat.slice(1) + 's'),
        eyebrow: categoryCopy?.eyebrow ?? 'Complete Your Build',
        items,
      });
    }

    return result;
  });

  readonly isEmpty = computed(() =>
    !this.productService.loading() && !this.productService.error() && this.groups().length === 0
  );

  heroTitle = computed(() => {
    const cat = normalizeFilter(this.activeCategory());
    if (!cat) return 'Canopies & Bakkie Trays';
    if (cat === 'tray')   return 'Bakkie Trays';
    if (cat === 'canopy') return 'Canopies';
    return PRODUCT_CATEGORY_COPY[cat]?.label ?? (cat.charAt(0).toUpperCase() + cat.slice(1));
  });

  heroDescription = computed(() => {
    const category = normalizeFilter(this.activeCategory());
    return category ? this.categoryService.bySlug(category)?.description ?? 'Browse the current Navrik catalogue. Product details and availability are supplied from the catalogue.' : 'Browse the current Navrik catalogue. Product details and availability are supplied from the catalogue.';
  });

  cardBadge(p: CatalogProduct): { label: string; cls: string } | null {
    if (p.category === 'canopy' && p.size) return { label: p.size, cls: 'canopy-badge' };
    if (p.tray_type === 'premium') return { label: 'Premium', cls: 'premium-badge' };
    if (p.tray_type === 'standard') return { label: 'Standard', cls: 'standard-badge' };
    return null;
  }

  readonly skeletons = [0, 1, 2];

  ngOnInit(): void {
    window.scrollTo({ top: 0, behavior: 'instant' });
    this.productService.load();
    void this.categoryService.load();
    this.route.queryParamMap.subscribe(params => {
      this.activeCategory.set(params.get('category'));
    });
  }

  heroImage(p: CatalogProduct): string {
    return p.image_url || '';
  }

  listedPriceCents(product: CatalogProduct): number | null {
    const cents = product.base_price_cents;
    return this.purchaseMode(product) === 'online_checkout' && Number.isSafeInteger(cents) && (cents ?? 0) > 0
      ? cents ?? null
      : null;
  }

  purchaseMode(product: CatalogProduct): PurchaseMode {
    return resolveCatalogPurchaseMode(product.purchaseMode, product.base_price_cents);
  }

  openQuoteModal(product: CatalogProduct): void {
    this.quoteModalProduct.set(product.name);
    this.quoteModalOpen.set(true);
  }

  closeQuoteModal(): void {
    this.quoteModalOpen.set(false);
  }
}
