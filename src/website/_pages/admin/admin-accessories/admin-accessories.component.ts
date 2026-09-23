import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AdminService, CatalogAccessory } from '../../../_services/admin.service';
import { ImageUploadComponent } from '../../../_components/image-upload/image-upload.component';
import { ModalService } from '../../../_services/modal.service';

const BLANK: Omit<CatalogAccessory, 'id'> = {
  slug: '', name: '', category: '' as any, price: 0, description: '', image_url: '', is_active: true, sort_order: 0,
};

@Component({
  selector: 'website-admin-accessories',
  templateUrl: './admin-accessories.component.html',
  styleUrls: ['./admin-accessories.component.scss'],
  standalone: true,
  imports: [CommonModule, DecimalPipe, ReactiveFormsModule, MatIconModule, ImageUploadComponent],
})
export class AdminAccessoriesComponent implements OnInit {
  private adminService = inject(AdminService);
  private modal = inject(ModalService);
  private fb = inject(FormBuilder);

  accessories = signal<CatalogAccessory[]>([]);
  loading = signal(true);
  saving = signal(false);
  error = signal('');
  showForm = signal(false);
  editingId = signal<number | null>(null);

  readonly categories = ['toolbox', 'drop_side', 'sequential_led', 'rear_guard', 'canopy'];

  form = this.fb.nonNullable.group({
    slug:        ['', Validators.required],
    name:        ['', Validators.required],
    category:    ['', Validators.required],
    price:       [0, [Validators.required, Validators.min(0)]],
    description: [''],
    image_url:   [''],
    is_active:   [true],
    sort_order:  [0],
  });

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.accessories.set(await this.adminService.getAccessories());
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

  openEdit(a: CatalogAccessory): void {
    this.editingId.set(a.id!);
    this.form.patchValue({ ...a } as any);
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
      const val = this.form.getRawValue() as unknown as CatalogAccessory;
      if (this.editingId()) {
        const updated = await this.adminService.updateAccessory({ ...val, id: this.editingId()! });
        this.accessories.update(list => list.map(a => a.id === updated.id ? updated : a));
      } else {
        const created = await this.adminService.createAccessory(val);
        this.accessories.update(list => [created, ...list]);
      }
      this.cancelForm();
    } catch (e: any) {
      this.error.set(e.error?.error || e.message || 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }

  async remove(a: CatalogAccessory): Promise<void> {
    const ok = await this.modal.confirm({
      title: 'Delete Accessory',
      message: `Delete "${a.name}"? This will also remove all compatibility rules for this accessory.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await this.adminService.deleteAccessory(a.id!);
      this.accessories.update(list => list.filter(x => x.id !== a.id));
    } catch (e: any) {
      this.error.set(e.message);
    }
  }

  autoSlug(): void {
    const { name, category } = this.form.getRawValue();
    if (name) {
      this.form.patchValue({ slug: `navrik-${category}-${name}`.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '') });
    }
  }
}
