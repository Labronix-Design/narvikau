import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { AccessoryService } from '../../../_services/accessory.service';
import { CartService } from '../../../_services/cart.service';
import { ProductService } from '../../../_services/product.service';
import { SiteSettingsService } from '../../../_services/site-settings.service';
import { CatalogProduct, CatalogProductVariant, PurchaseMode, resolveCatalogPurchaseMode } from '../../../_models/catalog.models';
import { QuoteConfiguration, QuoteModalComponent } from '../../../_components/quote-modal/quote-modal.component';

interface VariantGroup {
  type: string;
  label: string;
  options: CatalogProductVariant[];
}

function labelFor(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

@Component({
  selector: 'website-product-detail',
  templateUrl: './product-detail.component.html',
  styleUrls: ['./product-detail.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, QuoteModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly productService = inject(ProductService);
  readonly accessoryService = inject(AccessoryService);
  readonly cartService = inject(CartService);
  readonly siteSettings = inject(SiteSettingsService);

  private slug = '';
  readonly galleryIndex = signal(0);
  readonly quoteModalOpen = signal(false);
  readonly selectedAccessoryIds = signal<ReadonlySet<number>>(new Set());
  readonly selectedVariants = signal<ReadonlyMap<string, CatalogProductVariant>>(new Map());

  readonly product = computed(() => this.productService.bySlug(this.slug) ?? null);
  readonly isLoading = computed(() => this.productService.loading() || this.accessoryService.loading());
  readonly hasError = computed(() => !!this.productService.error() || !!this.accessoryService.error());
  readonly gallery = computed(() => {
    const product = this.product();
    if (!product) return [];
    return product.gallery_urls?.length
      ? product.gallery_urls
      : product.image_url ? [product.image_url] : [];
  });
  readonly currentImage = computed(() => this.gallery()[this.galleryIndex()] ?? '');
  readonly specList = computed(() => {
    const product = this.product();
    if (!product) return [];
    return [
      { label: 'Material', value: product.material },
      { label: 'Thickness', value: product.thickness },
      { label: 'Front door / window', value: product.front_door_window },
      { label: 'Side door', value: product.side_door },
      { label: 'Rear door', value: product.rear_door },
      { label: 'Vehicle fit', value: product.vehicle_fit },
    ].filter((spec): spec is { label: string; value: string } => !!spec.value);
  });
  readonly variantGroups = computed<VariantGroup[]>(() => {
    const groups = new Map<string, CatalogProductVariant[]>();
    for (const variant of this.product()?.variants ?? []) {
      const options = groups.get(variant.variant_type) ?? [];
      options.push(variant);
      groups.set(variant.variant_type, options);
    }
    return [...groups.entries()].map(([type, options]) => ({
      type,
      label: labelFor(type),
      options: [...options].sort((left, right) => left.sort_order - right.sort_order),
    }));
  });
  readonly compatibleAccessories = computed(() => {
    const product = this.product();
    return product
      ? this.accessoryService.compatibleWith({ trayType: product.tray_type, productId: product.id })
      : [];
  });
  readonly selectedAccessorySlugs = computed(() => {
    const ids = this.selectedAccessoryIds();
    return this.compatibleAccessories()
      .filter((accessory) =>
        ids.has(accessory.id)
        && resolveCatalogPurchaseMode(accessory.purchaseMode, accessory.price_cents) === 'online_checkout'
      )
      .map((accessory) => ({ slug: accessory.slug }));
  });
  readonly selectedVariantValues = computed(() => [...this.selectedVariants().values()]
    .map(({ variant_type, variant_value }) => ({ variant_type, variant_value }))
    .sort((left, right) => `${left.variant_type}\u0000${left.variant_value}`.localeCompare(`${right.variant_type}\u0000${right.variant_value}`))
  );
  readonly quoteConfiguration = computed<QuoteConfiguration>(() => {
    const selectedAccessoryIds = this.selectedAccessoryIds();
    return {
      variants: [...this.selectedVariants().values()]
        .map((variant) => ({ label: labelFor(variant.variant_type), value: variant.label })),
      accessories: this.compatibleAccessories()
        .filter((accessory) => selectedAccessoryIds.has(accessory.id))
        .map((accessory) => accessory.name),
    };
  });

  async ngOnInit(): Promise<void> {
    this.slug = this.route.snapshot.paramMap.get('slug') ?? '';
    window.scrollTo({ top: 0, behavior: 'instant' });
    await Promise.all([this.productService.load(), this.accessoryService.load()]);
    if (!this.product()) await this.router.navigate(['/products']);
  }

  selectGalleryImage(index: number): void {
    this.galleryIndex.set(index);
  }

  selectVariant(type: string, option: CatalogProductVariant): void {
    this.selectedVariants.update((selected) => {
      const next = new Map(selected);
      next.set(type, option);
      return next;
    });
  }

  isSelectedVariant(type: string, option: CatalogProductVariant): boolean {
    return this.selectedVariants().get(type)?.id === option.id;
  }

  toggleAccessory(id: number): void {
    this.selectedAccessoryIds.update((selected) => {
      const next = new Set(selected);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  isSelectedAccessory(id: number): boolean {
    return this.selectedAccessoryIds().has(id);
  }

  addToCart(): void {
    const product = this.product();
    if (!product || this.purchaseMode(product) !== 'online_checkout') return;
    this.cartService.addToCart({
      slug: product.slug,
      heading: product.name,
      variants: this.selectedVariantValues(),
      accessories: this.selectedAccessorySlugs(),
      tags: [labelFor(product.category)],
      accentColor: this.siteSettings.settings().primary_color,
      image: product.image_url,
    });
  }

  openQuoteModal(): void {
    this.quoteModalOpen.set(true);
  }

  closeQuoteModal(): void {
    this.quoteModalOpen.set(false);
  }

  categoryLabel(category: string): string {
    return labelFor(category);
  }

  purchaseMode(product: CatalogProduct | null = this.product()): PurchaseMode {
    return resolveCatalogPurchaseMode(product?.purchaseMode, product?.base_price_cents);
  }
}
