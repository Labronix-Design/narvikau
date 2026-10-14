import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ProductService } from '../../_services/product.service';
import { SiteSettingsService } from '../../_services/site-settings.service';
import { CatalogProduct } from '../../_models/catalog.models';
import { StorefrontReadModelService } from '../../_services/storefront-read-model.service';
import { QuoteModalComponent } from '../../_components/quote-modal/quote-modal.component';

export function toProductCardImage(primaryImageUrl: string | null, galleryUrls: readonly string[]): string {
  return primaryImageUrl?.trim() || galleryUrls.find(url => url.trim())?.trim() || '';
}

@Component({
  selector: 'website-products',
  templateUrl: './products.component.html',
  styleUrls: ['./products.component.scss'],
  standalone: true,
  imports: [RouterModule, MatIconModule, QuoteModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductsPage implements OnInit {
  readonly productService = inject(ProductService);
  private readonly storefront = inject(StorefrontReadModelService);
  readonly siteSettings = inject(SiteSettingsService);
  readonly quoteModalOpen = signal(false);
  readonly quoteModalProduct = signal('');
  readonly productSections = computed(() => [...(this.storefront.model()?.categories ?? [])]
    .sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name))
    .flatMap(category => {
      const products = this.productService.byCategory(category.slug);
      return products.length ? [{ category, products }] : [];
    }));
  readonly isEmpty = computed(() =>
    !this.productService.loading()
    && !this.productService.error()
    && this.productSections().length === 0
  );
  readonly skeletons = [0, 1, 2];

  ngOnInit(): void {
    window.scrollTo({ top: 0, behavior: 'instant' });
    void this.productService.load();
  }

  heroImage(product: CatalogProduct): string {
    return toProductCardImage(product.image_url, product.gallery_urls);
  }

  openQuoteModal(product: CatalogProduct): void {
    this.quoteModalProduct.set(product.name);
    this.quoteModalOpen.set(true);
  }

  closeQuoteModal(): void {
    this.quoteModalOpen.set(false);
  }
}
