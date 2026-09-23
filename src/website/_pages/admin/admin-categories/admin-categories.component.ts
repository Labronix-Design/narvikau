import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AdminService, CatalogCategory } from '../../../_services/admin.service';
import { ModalService } from '../../../_services/modal.service';

@Component({
  selector: 'website-admin-categories',
  templateUrl: './admin-categories.component.html',
  styleUrls: ['./admin-categories.component.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
})
export class AdminCategoriesComponent implements OnInit {
  private adminService = inject(AdminService);
  private fb           = inject(FormBuilder);
  private modal        = inject(ModalService);

  categories  = signal<CatalogCategory[]>([]);
  loading     = signal(true);
  saving      = signal(false);
  showCreate  = signal(false);
  editingId   = signal<number | null>(null);
  error       = signal('');
  saveError   = signal('');

  form = this.fb.nonNullable.group({
    slug:        ['', Validators.required],
    name:        ['', Validators.required],
    type:        ['', Validators.required],
    eyebrow:     [''],
    icon:        [''],
    description: [''],
    sort_order:  [0],
  });

  async ngOnInit(): Promise<void> { await this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.categories.set(await this.adminService.getCategories());
    } catch (e: any) {
      this.error.set(e.message || 'Failed to load categories');
    } finally {
      this.loading.set(false);
    }
  }

  openCreate(): void {
    this.editingId.set(null);
    this.form.reset({ sort_order: 0 });
    this.saveError.set('');
    this.showCreate.set(true);
  }

  editCategory(cat: CatalogCategory): void {
    this.editingId.set(cat.id!);
    this.form.patchValue({
      slug:        cat.slug,
      name:        cat.name,
      type:        cat.type,
      eyebrow:     cat.eyebrow     ?? '',
      icon:        cat.icon        ?? '',
      description: cat.description ?? '',
      sort_order:  cat.sort_order  ?? 0,
    });
    this.saveError.set('');
    this.showCreate.set(true);
  }

  cancelForm(): void {
    this.showCreate.set(false);
    this.editingId.set(null);
    this.form.reset({ sort_order: 0 });
  }

  async onSave(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.saveError.set('');
    try {
      const v = this.form.getRawValue();
      const payload: Partial<CatalogCategory> = {
        slug:        v.slug,
        name:        v.name,
        type:        v.type as 'product' | 'accessory',
        eyebrow:     v.eyebrow     || null,
        icon:        v.icon        || null,
        description: v.description || null,
        sort_order:  v.sort_order  ?? 0,
      };
      const id = this.editingId();
      if (id) {
        const updated = await this.adminService.updateCategory({ id, ...payload } as CatalogCategory);
        this.categories.update(cs => cs.map(c => c.id === id ? updated : c));
      } else {
        const created = await this.adminService.createCategory(payload as CatalogCategory);
        this.categories.update(cs => [...cs, created]);
      }
      this.cancelForm();
    } catch (e: any) {
      this.saveError.set(e.error?.error || e.message || 'Failed to save category');
    } finally {
      this.saving.set(false);
    }
  }

  async toggleActive(cat: CatalogCategory): Promise<void> {
    try {
      const updated = await this.adminService.updateCategory({ ...cat, is_active: !cat.is_active });
      this.categories.update(cs => cs.map(c => c.id === cat.id ? updated : c));
    } catch (e: any) {
      await this.modal.alert({ title: 'Update Failed', message: e.message || 'Unknown error', variant: 'danger' });
    }
  }

  async onDelete(cat: CatalogCategory): Promise<void> {
    const ok = await this.modal.confirm({
      title: 'Delete Category',
      message: `Delete category "${cat.name}"?\n\nThis may affect products and accessories linked to this category.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await this.adminService.deleteCategory(cat.id!);
      this.categories.update(cs => cs.filter(c => c.id !== cat.id));
    } catch (e: any) {
      await this.modal.alert({ title: 'Delete Failed', message: e.message || 'Unknown error', variant: 'danger' });
    }
  }

  productCategories(): CatalogCategory[] {
    return this.categories().filter(c => c.type === 'product');
  }

  accessoryCategories(): CatalogCategory[] {
    return this.categories().filter(c => c.type === 'accessory');
  }
}
