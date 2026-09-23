import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { AdminService, CatalogProduct, ProductVariant } from '../../../_services/admin.service';
import { ModalService } from '../../../_services/modal.service';
import { ImageUploadComponent } from '../../../_components/image-upload/image-upload.component';

const EMPTY_PRODUCT: Omit<CatalogProduct, 'id'> = {
  slug: 'navrik-canopy-adventure',
  name: 'Navrik Canopy — Adventure',
  category: 'canopy',
  size: 'Adventure',
  color: 'black',
  description: null,
  image_url: null,
  is_active: true,
  sort_order: 0,
  gallery_urls: [],
  material: null,
  thickness: null,
  front_door_window: null,
  side_door: null,
  rear_door: null,
  vehicle_fit: null,
};

@Component({
  selector: 'website-admin-products',
  templateUrl: './admin-products.component.html',
  styleUrls: ['./admin-products.component.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, ImageUploadComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminProductsComponent {
  private readonly adminService = inject(AdminService);
  private readonly modal = inject(ModalService);
  private readonly fb = inject(FormBuilder);

  readonly products = signal<CatalogProduct[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly showForm = signal(false);
  readonly editingId = signal<number | null>(null);
  readonly saving = signal(false);
  readonly expandedProductId = signal<number | null>(null);
  readonly variants = signal<ProductVariant[]>([]);
  readonly variantLoading = signal(false);
  readonly showVariantForm = signal(false);
  readonly editingVariantId = signal<number | null>(null);
  readonly variantSaving = signal(false);

  readonly canopyModels = [
    { slug: 'navrik-canopy-adventure', name: 'Navrik Canopy — Adventure', size: 'Adventure' },
    { slug: 'navrik-canopy-overland', name: 'Navrik Canopy — Overland', size: 'Overland' },
    { slug: 'navrik-canopy-sports', name: 'Navrik Canopy — Sports', size: 'Sports' },
    { slug: 'navrik-canopy-defender', name: 'Navrik Canopy — Defender', size: 'Defender' },
  ] as const;

  readonly form = this.fb.nonNullable.group({
    slug: [EMPTY_PRODUCT.slug, Validators.required],
    name: [EMPTY_PRODUCT.name, Validators.required],
    size: [EMPTY_PRODUCT.size ?? ''],
    color: [EMPTY_PRODUCT.color, Validators.required],
    description: [''],
    image_url: [''],
    is_active: [true],
    sort_order: [0],
    gallery_urls: this.fb.nonNullable.control<string[]>([]),
    material: [''],
    thickness: [''],
    front_door_window: [''],
    side_door: [''],
    rear_door: [''],
    vehicle_fit: [''],
  });

  readonly variantForm = this.fb.nonNullable.group({
    variant_type: ['cab_type', Validators.required],
    variant_value: ['', Validators.required],
    label: ['', Validators.required],
    is_active: [true],
    sort_order: [0],
  });

  readonly variantTypes = ['color', 'cab_type', 'size'];

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.products.set(await this.adminService.getProducts());
    } catch {
      this.error.set('Canopies could not be loaded.');
    } finally {
      this.loading.set(false);
    }
  }

  openCreate(): void {
    this.editingId.set(null);
    this.form.reset({ ...this.toFormValue(EMPTY_PRODUCT), gallery_urls: [] });
    this.showForm.set(true);
  }

  openEdit(product: CatalogProduct): void {
    this.editingId.set(product.id ?? null);
    this.form.reset(this.toFormValue(product));
    this.showForm.set(true);
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
  }

  applyModel(slug: string): void {
    const model = this.canopyModels.find(item => item.slug === slug);
    if (model) this.form.patchValue({ name: model.name, size: model.size });
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    const value = this.form.getRawValue();
    const payload: CatalogProduct = {
      ...(this.editingId() ? { id: this.editingId()! } : {}),
      slug: value.slug,
      name: value.name,
      category: 'canopy',
      size: value.size || null,
      color: value.color,
      description: value.description || null,
      image_url: value.image_url || null,
      is_active: value.is_active,
      sort_order: value.sort_order,
      gallery_urls: value.gallery_urls.filter(Boolean),
      material: value.material || null,
      thickness: value.thickness || null,
      front_door_window: value.front_door_window || null,
      side_door: value.side_door || null,
      rear_door: value.rear_door || null,
      vehicle_fit: value.vehicle_fit || null,
    };

    try {
      const saved = this.editingId()
        ? await this.adminService.updateProduct(payload)
        : await this.adminService.createProduct(payload);
      this.products.update(items => this.editingId()
        ? items.map(item => item.id === saved.id ? saved : item)
        : [...items, saved].sort((left, right) => left.sort_order - right.sort_order));
      this.cancelForm();
    } catch (error: any) {
      this.error.set(error.error?.error || error.message || 'Canopy save failed.');
    } finally {
      this.saving.set(false);
    }
  }

  async remove(product: CatalogProduct): Promise<void> {
    if (!product.id) return;
    const confirmed = await this.modal.confirm({
      title: 'Delete Canopy',
      message: `Delete "${product.name}"?`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await this.adminService.deleteProduct(product.id);
      this.products.update(items => items.filter(item => item.id !== product.id));
    } catch (error: any) {
      this.error.set(error.message || 'Canopy delete failed.');
    }
  }

  addGalleryImage(): void {
    this.form.controls.gallery_urls.setValue([...this.form.controls.gallery_urls.value, '']);
  }

  updateGalleryImage(index: number, url: string): void {
    const urls = [...this.form.controls.gallery_urls.value];
    urls[index] = url;
    this.form.controls.gallery_urls.setValue(urls);
  }

  removeGalleryImage(index: number): void {
    this.form.controls.gallery_urls.setValue(this.form.controls.gallery_urls.value.filter((_, itemIndex) => itemIndex !== index));
  }

  async toggleVariants(product: CatalogProduct): Promise<void> {
    if (!product.id) return;
    if (this.expandedProductId() === product.id) {
      this.expandedProductId.set(null);
      this.variants.set([]);
      return;
    }
    this.expandedProductId.set(product.id);
    this.showVariantForm.set(false);
    this.variantLoading.set(true);
    try {
      this.variants.set(await this.adminService.getVariants(product.id));
    } catch {
      this.error.set('Canopy options could not be loaded.');
    } finally {
      this.variantLoading.set(false);
    }
  }

  variantTypeLabels(): string[] {
    return [...new Set(this.variants().map(variant => variant.variant_type))];
  }

  variantsByType(type: string): ProductVariant[] {
    return this.variants().filter(variant => variant.variant_type === type);
  }

  openNewVariantForm(): void {
    this.editingVariantId.set(null);
    this.variantForm.reset({ variant_type: 'cab_type', variant_value: '', label: '', is_active: true, sort_order: 0 });
    this.showVariantForm.set(true);
  }

  editVariant(variant: ProductVariant): void {
    this.editingVariantId.set(variant.id ?? null);
    this.variantForm.reset({
      variant_type: variant.variant_type,
      variant_value: variant.variant_value,
      label: variant.label,
      is_active: variant.is_active,
      sort_order: variant.sort_order,
    });
    this.showVariantForm.set(true);
  }

  cancelVariantForm(): void {
    this.showVariantForm.set(false);
    this.editingVariantId.set(null);
  }

  async saveVariant(): Promise<void> {
    const productId = this.expandedProductId();
    if (!productId || this.variantForm.invalid || this.variantSaving()) return;
    this.variantSaving.set(true);
    try {
      const value = this.variantForm.getRawValue();
      const saved = await this.adminService.saveVariant({
        ...(this.editingVariantId() ? { id: this.editingVariantId()! } : {}),
        product_id: productId,
        ...value,
      });
      this.variants.update(items => this.editingVariantId()
        ? items.map(item => item.id === saved.id ? saved : item)
        : [...items, saved]);
      this.cancelVariantForm();
    } catch (error: any) {
      this.error.set(error.error?.error || error.message || 'Canopy option save failed.');
    } finally {
      this.variantSaving.set(false);
    }
  }

  async toggleVariantActive(variant: ProductVariant): Promise<void> {
    const saved = await this.adminService.saveVariant({ ...variant, is_active: !variant.is_active });
    this.variants.update(items => items.map(item => item.id === saved.id ? saved : item));
  }

  async deleteVariant(variant: ProductVariant): Promise<void> {
    if (!variant.id) return;
    const confirmed = await this.modal.confirm({
      title: 'Delete Canopy Option',
      message: `Delete "${variant.label}"?`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    await this.adminService.deleteVariant(variant.id);
    this.variants.update(items => items.filter(item => item.id !== variant.id));
  }

  private toFormValue(product: Omit<CatalogProduct, 'id'> | CatalogProduct) {
    return {
      slug: product.slug,
      name: product.name,
      size: product.size ?? '',
      color: product.color,
      description: product.description ?? '',
      image_url: product.image_url ?? '',
      is_active: product.is_active,
      sort_order: product.sort_order,
      gallery_urls: [...product.gallery_urls],
      material: product.material ?? '',
      thickness: product.thickness ?? '',
      front_door_window: product.front_door_window ?? '',
      side_door: product.side_door ?? '',
      rear_door: product.rear_door ?? '',
      vehicle_fit: product.vehicle_fit ?? '',
    };
  }
}
