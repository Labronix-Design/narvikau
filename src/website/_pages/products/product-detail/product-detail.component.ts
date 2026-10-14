import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ProductService } from '../../../_services/product.service';
import { SiteSettingsService } from '../../../_services/site-settings.service';
import { StorefrontReadModelService } from '../../../_services/storefront-read-model.service';
import { QuoteModalComponent } from '../../../_components/quote-modal/quote-modal.component';

export function toProductGallery(primaryImageUrl: string | null, galleryUrls: readonly string[]): string[] {
  return [...new Set(
    [primaryImageUrl, ...galleryUrls]
      .filter((url): url is string => typeof url === 'string')
      .map(url => url.trim())
      .filter(Boolean),
  )];
}

@Component({
  selector: 'website-product-detail',
  templateUrl: './product-detail.component.html',
  styleUrls: ['./product-detail.component.scss'],
  standalone: true,
  imports: [RouterModule, MatIconModule, QuoteModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly productService = inject(ProductService);
  private readonly storefront = inject(StorefrontReadModelService);
  readonly siteSettings = inject(SiteSettingsService);
  private slug = '';
  readonly galleryIndex = signal(0);
  readonly quoteModalOpen = signal(false);
  readonly product = computed(() => this.productService.bySlug(this.slug) ?? null);
  readonly categoryName = computed(() => {
    const category = this.product()?.category;
    return this.storefront.model()?.categories.find(item => item.slug === category)?.name ?? 'Products';
  });
  readonly gallery = computed(() => {
    const product = this.product();
    if (!product) return [];
    return toProductGallery(product.image_url, product.gallery_urls);
  });
  readonly currentImage = computed(() => this.gallery()[this.galleryIndex()] ?? '');
  readonly specList = computed(() => {
    const product = this.product();
    if (!product) return [];
    const legacy = [
      { label: 'Material', value: product.material },
      { label: 'Thickness', value: product.thickness },
      { label: 'Front door / window', value: product.front_door_window },
      { label: 'Side door', value: product.side_door },
      { label: 'Rear door', value: product.rear_door },
      { label: 'Vehicle fit', value: product.vehicle_fit },
    ].filter((spec): spec is { label: string; value: string } => !!spec.value);
    const labels = new Set(legacy.map(spec => spec.label.toLowerCase()));
    return [...legacy, ...Object.entries(product.specifications)
      .filter(([label, value]) => !!value && !labels.has(label.toLowerCase()))
      .map(([label, value]) => ({ label, value }))];
  });

  async ngOnInit(): Promise<void> {
    this.slug = this.route.snapshot.paramMap.get('slug') ?? '';
    window.scrollTo({ top: 0, behavior: 'instant' });
    await this.productService.load();
    if (!this.product()) await this.router.navigate(['/products']);
  }

  selectGalleryImage(index: number): void {
    this.galleryIndex.set(index);
  }

  openQuoteModal(): void {
    this.quoteModalOpen.set(true);
  }

  closeQuoteModal(): void {
    this.quoteModalOpen.set(false);
  }
}
