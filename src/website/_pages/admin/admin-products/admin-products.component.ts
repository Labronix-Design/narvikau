import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AdminService, CatalogProduct, ProductVariant } from '../../../_services/admin.service';
import { ImageUploadComponent } from '../../../_components/image-upload/image-upload.component';
import { ModalService } from '../../../_services/modal.service';

const BLANK: Omit<CatalogProduct, 'id'> = {
  slug: '', name: '', category: '' as any, tray_type: null, size: '',
  color: '' as any, base_price: 0, coating_cost: 0, description: '', image_url: '', is_active: true, sort_order: 0,
  gallery_urls: [], material: null, thickness: null, front_door_window: null, side_door: null, rear_door: null, vehicle_fit: null,
};

@Component({
  selector: 'website-admin-products',
  templateUrl: './admin-products.component.html',
  styleUrls: ['./admin-products.component.scss'],
  standalone: true,
  imports: [CommonModule, DecimalPipe, ReactiveFormsModule, MatIconModule, ImageUploadComponent],
})
export class AdminProductsComponent implements OnInit {
  private adminService = inject(AdminService);
  private fb = inject(FormBuilder);
  private modal = inject(ModalService);

  products      = signal<CatalogProduct[]>([]);
  loading       = signal(true);
  saving        = signal(false);
  error         = signal('');
  showForm      = signal(false);
  editingId     = signal<number | null>(null);

  // ── Variant state
  expandedProductId  = signal<number | null>(null);
  variants           = signal<ProductVariant[]>([]);
  variantLoading     = signal(false);
  showVariantForm    = signal(false);
  variantSaving      = signal(false);
  editingVariantId   = signal<number | null>(null);

  form = this.fb.nonNullable.group({
    slug:         ['', Validators.required],
    name:         ['', Validators.required],
    category:     ['' as string, Validators.required],
    tray_type:    [null as 'standard' | 'premium' | null],
    size:         [''],
    color:        ['', Validators.required],
    base_price:   [0, [Validators.required, Validators.min(0)]],
    coating_cost: [0],
    description:  [''],
    image_url:    [''],
    is_active:    [true],
    sort_order:   [0],
    gallery_urls:      [[] as string[]],
    material:          [''],
    thickness:         [''],
    front_door_window: [''],
    side_door:         [''],
    rear_door:         [''],
    vehicle_fit:       [''],
  });

  variantForm = this.fb.nonNullable.group({
    variant_type:  ['cab_type', Validators.required],
    variant_value: ['', Validators.required],
    label:         ['', Validators.required],
    price_delta:   [0, Validators.required],
    is_active:     [true],
    sort_order:    [0],
  });

  readonly sizes  = ['single-cab', 'extra-cab', 'double-cab', 'double-cab-short'];
  readonly colors = ['silver', 'black', 'white'];
  readonly variantTypes = ['color', 'cab_type', 'size'];

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.products.set(await this.adminService.getProducts());
    } catch (e: any) {
      this.error.set(e.message);
    } finally {
      this.loading.set(false);
    }
  }

  openCreate(): void {
    this.editingId.set(null);
    this.form.reset(BLANK as any);
    this.showForm.set(true);
  }

  openEdit(p: CatalogProduct): void {
    this.editingId.set(p.id!);
    this.form.patchValue({ ...p } as any);
    this.showForm.set(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
    this.error.set('');
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const val = this.form.getRawValue() as unknown as CatalogProduct;
      if (this.editingId()) {
        const updated = await this.adminService.updateProduct({ ...val, id: this.editingId()! });
        this.products.update(list => list.map(p => p.id === updated.id ? updated : p));
      } else {
        const created = await this.adminService.createProduct(val);
        this.products.update(list => [created, ...list]);
      }
      this.cancelForm();
    } catch (e: any) {
      this.error.set(e.error?.error || e.message || 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }

  async remove(p: CatalogProduct): Promise<void> {
    const ok = await this.modal.confirm({
      title: 'Delete Product',
      message: `Delete "${p.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await this.adminService.deleteProduct(p.id!);
      this.products.update(list => list.filter(x => x.id !== p.id));
      if (this.expandedProductId() === p.id) {
        this.expandedProductId.set(null);
        this.variants.set([]);
      }
    } catch (e: any) {
      this.error.set(e.message);
    }
  }

  autoSlug(): void {
    const { name, category, tray_type, size, color } = this.form.getRawValue();
    if (!name) return;
    const slug = category === 'canopy'
      ? `navrik-canopy-${name}`.toLowerCase().replace(/\s+/g, '-')
      : category === 'custom-made-tray-and-canopy-combo'
        ? `navrik-custom-tray-canopy-${name}`.toLowerCase().replace(/\s+/g, '-')
      : `navrik-${tray_type || 'standard'}-tray-${size || 'double-cab'}-${color}`.toLowerCase().replace(/\s+/g, '-');
    this.form.patchValue({ slug });
  }

  // ── Gallery images (canopy products) ──────────────────────────

  addGalleryImage(): void {
    this.form.patchValue({ gallery_urls: [...this.form.value.gallery_urls!, ''] });
  }

  updateGalleryImage(index: number, url: string): void {
    const urls = [...this.form.value.gallery_urls!];
    urls[index] = url;
    this.form.patchValue({ gallery_urls: urls });
  }

  removeGalleryImage(index: number): void {
    const urls = [...this.form.value.gallery_urls!];
    urls.splice(index, 1);
    this.form.patchValue({ gallery_urls: urls });
  }

  // ── Variants ─────────────────────────────────────────────────

  async toggleVariants(p: CatalogProduct): Promise<void> {
    if (this.expandedProductId() === p.id) {
      this.expandedProductId.set(null);
      this.variants.set([]);
      this.showVariantForm.set(false);
      return;
    }
    this.expandedProductId.set(p.id!);
    this.showVariantForm.set(false);
    this.editingVariantId.set(null);
    this.variantForm.reset({ variant_type: 'cab_type', variant_value: '', label: '', price_delta: 0, is_active: true, sort_order: 0 });
    this.variantLoading.set(true);
    try {
      this.variants.set(await this.adminService.getVariants(p.id!));
    } catch (e: any) {
      this.error.set('Failed to load variants: ' + e.message);
    } finally {
      this.variantLoading.set(false);
    }
  }

  variantsByType(type: string): ProductVariant[] {
    return this.variants().filter(v => v.variant_type === type);
  }

  variantTypeLabels(): string[] {
    return [...new Set(this.variants().map(v => v.variant_type))];
  }

  openNewVariantForm(): void {
    this.editingVariantId.set(null);
    this.variantForm.reset({ variant_type: 'cab_type', variant_value: '', label: '', price_delta: 0, is_active: true, sort_order: 0 });
    this.showVariantForm.set(true);
  }

  editVariant(v: ProductVariant): void {
    this.editingVariantId.set(v.id!);
    this.variantForm.patchValue({
      variant_type:  v.variant_type,
      variant_value: v.variant_value,
      label:         v.label,
      price_delta:   v.price_delta,
      is_active:     v.is_active,
      sort_order:    v.sort_order,
    });
    this.showVariantForm.set(true);
  }

  cancelVariantForm(): void {
    this.showVariantForm.set(false);
    this.editingVariantId.set(null);
  }

  async saveVariant(): Promise<void> {
    if (this.variantForm.invalid || this.variantSaving()) return;
    const productId = this.expandedProductId();
    if (!productId) return;
    this.variantSaving.set(true);
    try {
      const val = this.variantForm.getRawValue();
      const payload: any = {
        product_id:    productId,
        variant_type:  val.variant_type,
        variant_value: val.variant_value,
        label:         val.label,
        price_delta:   val.price_delta,
        is_active:     val.is_active,
        sort_order:    val.sort_order,
      };
      const editId = this.editingVariantId();
      if (editId) payload.id = editId;
      const saved = await this.adminService.saveVariant(payload);
      if (editId) {
        this.variants.update(vs => vs.map(v => v.id === editId ? saved : v));
      } else {
        this.variants.update(vs => [...vs, saved]);
      }
      this.cancelVariantForm();
    } catch (e: any) {
      this.error.set(e.error?.error || e.message || 'Variant save failed');
    } finally {
      this.variantSaving.set(false);
    }
  }

  async deleteVariant(v: ProductVariant): Promise<void> {
    const ok = await this.modal.confirm({
      title: 'Delete Variant',
      message: `Delete variant "${v.label}"?`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await this.adminService.deleteVariant(v.id!);
      this.variants.update(vs => vs.filter(x => x.id !== v.id));
    } catch (e: any) {
      this.error.set(e.message);
    }
  }

  async toggleVariantActive(v: ProductVariant): Promise<void> {
    try {
      const saved = await this.adminService.saveVariant({
        id: v.id, product_id: v.product_id,
        variant_type: v.variant_type, variant_value: v.variant_value,
        label: v.label, price_delta: v.price_delta, is_active: !v.is_active, sort_order: v.sort_order,
      });
      this.variants.update(vs => vs.map(x => x.id === v.id ? saved : x));
    } catch (e: any) {
      this.error.set(e.message);
    }
  }

  priceDeltaDisplay(delta: number): string {
    if (delta === 0) return 'Base';
    return (delta > 0 ? '+' : '') + 'R ' + Math.abs(delta).toLocaleString('en-ZA');
  }
}
