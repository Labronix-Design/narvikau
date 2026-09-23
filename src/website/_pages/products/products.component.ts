import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ProductService } from '../../_services/product.service';
import { SiteSettingsService } from '../../_services/site-settings.service';
import { CatalogProduct } from '../../_models/catalog.models';
import { QuoteModalComponent } from '../../_components/quote-modal/quote-modal.component';

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
  readonly siteSettings = inject(SiteSettingsService);
  readonly quoteModalOpen = signal(false);
  readonly quoteModalProduct = signal('');
  readonly isEmpty = computed(() =>
    !this.productService.loading()
    && !this.productService.error()
    && this.productService.products().length === 0
  );
  readonly skeletons = [0, 1, 2];

  ngOnInit(): void {
    window.scrollTo({ top: 0, behavior: 'instant' });
    void this.productService.load();
  }

  heroImage(product: CatalogProduct): string {
    return product.image_url || '';
  }

  openQuoteModal(product: CatalogProduct): void {
    this.quoteModalProduct.set(product.name);
    this.quoteModalOpen.set(true);
  }

  closeQuoteModal(): void {
    this.quoteModalOpen.set(false);
  }
}
