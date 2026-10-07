import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ReactiveFormsModule, FormArray, FormBuilder, FormControl, FormGroup, ValidatorFn, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AdminService, CatalogProduct, ProductVariant } from '../../../_services/admin.service';
import { ModalService } from '../../../_services/modal.service';
import { ImageUploadComponent } from '../../../_components/image-upload/image-upload.component';
import { toRenderableSpecifications } from '../../../_models/catalog.models';

type SpecificationRow = FormGroup<{ label: FormControl<string>; value: FormControl<string> }>;

const requiredText = (maximum: number): ValidatorFn => control => {
  const value: unknown = control.value;
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maximum
    && !/[\u0000-\u001F\u007F]/.test(value.trim()) ? null : { invalidText: true };
};
const identifier: ValidatorFn = control => typeof control.value === 'string'
  && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(control.value.trim()) ? null : { identifier: true };
const specificationLabel: ValidatorFn = control => ['__proto__', 'constructor', 'prototype'].includes(control.value.trim())
  ? { reservedLabel: true } : null;
const uniqueLabels: ValidatorFn = control => {
  if (!(control instanceof FormArray)) return null;
  const labels = control.controls.map(row => String(row.get('label')?.value ?? '').trim());
  return new Set(labels).size === labels.length ? null : { duplicateLabels: true };
};

const EMPTY_PRODUCT: Omit<CatalogProduct, 'id'> = {
  slug: '',
  name: '',
  category: '',
  specifications: {},
  description: null,
  image_url: null,
  is_active: true,
  sort_order: 0,
  gallery_urls: [],
};

@Component({
  selector: 'website-admin-products',
  templateUrl: './admin-products.component.html',
  styleUrls: ['./admin-products.component.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, RouterLink, ImageUploadComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminProductsComponent {
  private readonly adminService = inject(AdminService);
  private readonly modal = inject(ModalService);
  private readonly fb = inject(FormBuilder);

  readonly products = signal<CatalogProduct[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly sessionExpired = signal(false);
  readonly catalogueEmpty = computed(() =>
    !this.loading() && !this.error() && !this.sessionExpired() && this.products().length === 0
  );
  readonly showForm = signal(false);
  readonly editingId = signal<number | null>(null);
  readonly saving = signal(false);
  readonly expandedProductId = signal<number | null>(null);
  readonly variants = signal<ProductVariant[]>([]);
  readonly variantLoading = signal(false);
  readonly showVariantForm = signal(false);
  readonly editingVariantId = signal<number | null>(null);
  readonly variantSaving = signal(false);

  readonly form = this.fb.nonNullable.group({
    slug: ['', [requiredText(120), identifier]],
    name: ['', requiredText(160)],
    category: ['', [requiredText(80), identifier]],
    description: ['', Validators.maxLength(4000)],
    image_url: ['', Validators.maxLength(500)],
    is_active: [true],
    sort_order: [0, [Validators.required, Validators.min(-100000), Validators.max(100000), Validators.pattern(/^-?\d+$/)]],
    gallery_urls: this.fb.nonNullable.control<string[]>([]),
    specifications: this.fb.array<SpecificationRow>([], [uniqueLabels, Validators.maxLength(30)]),
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
    this.sessionExpired.set(false);
    try {
      this.products.set(await this.adminService.getProducts());
    } catch (error: unknown) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.adminService.logout();
        this.sessionExpired.set(true);
      } else {
        this.error.set('Products could not be loaded.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  openCreate(): void {
    this.editingId.set(null);
    this.error.set('');
    this.form.controls.specifications.clear();
    this.form.reset({ ...this.toFormValue(EMPTY_PRODUCT), gallery_urls: [] });
    this.showForm.set(true);
  }

  openEdit(product: CatalogProduct): void {
    this.editingId.set(product.id ?? null);
    this.error.set('');
    this.form.controls.specifications.clear();
    for (const [label, value] of Object.entries(toRenderableSpecifications(product.specifications))) {
      this.form.controls.specifications.push(this.createSpecificationRow(label, value));
    }
    this.form.reset(this.toFormValue(product));
    this.showForm.set(true);
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
  }

  addSpecification(): void {
    if (this.form.controls.specifications.length < 30) {
      this.form.controls.specifications.push(this.createSpecificationRow());
    }
  }

  removeSpecification(index: number): void {
    this.form.controls.specifications.removeAt(index);
  }

  private createSpecificationRow(label = '', value = ''): SpecificationRow {
    return this.fb.nonNullable.group({
      label: [label, [requiredText(120), specificationLabel]],
      value: [value, requiredText(1000)],
    });
  }

  async save(): Promise<void> {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Check the highlighted product fields before saving.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    const value = this.form.getRawValue();
    const payload: CatalogProduct = {
      ...(this.editingId() ? { id: this.editingId()! } : {}),
      slug: value.slug.trim(),
      name: value.name.trim(),
      category: value.category.trim(),
      specifications: Object.fromEntries(value.specifications.map(row => [row.label.trim(), row.value.trim()])),
      description: value.description || null,
      image_url: value.image_url || null,
      is_active: value.is_active,
      sort_order: value.sort_order,
      gallery_urls: this.additionalGalleryUrls(value.image_url, value.gallery_urls),
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
      this.error.set(error.error?.error || error.message || 'Product save failed.');
    } finally {
      this.saving.set(false);
    }
  }

  async remove(product: CatalogProduct): Promise<void> {
    if (!product.id) return;
    const confirmed = await this.modal.confirm({
      title: 'Delete Product',
      message: `Delete "${product.name}"?`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await this.adminService.deleteProduct(product.id);
      this.products.update(items => items.filter(item => item.id !== product.id));
    } catch (error: any) {
      this.error.set(error.message || 'Product delete failed.');
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

  private additionalGalleryUrls(primaryImageUrl: string, galleryUrls: readonly string[]): string[] {
    const primary = primaryImageUrl.trim();
    return [...new Set(galleryUrls.map(url => url.trim()).filter(url => url && url !== primary))];
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
      this.error.set('Product options could not be loaded.');
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
      this.error.set(error.error?.error || error.message || 'Product option save failed.');
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
      title: 'Delete Product Option',
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
      category: product.category,
      specifications: Object.entries(toRenderableSpecifications(product.specifications)).map(([label, value]) => ({ label, value })),
      description: product.description ?? '',
      image_url: product.image_url ?? '',
      is_active: product.is_active,
      sort_order: product.sort_order,
      gallery_urls: [...product.gallery_urls],
    };
  }
}
