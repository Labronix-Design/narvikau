import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AdminCategory, AdminService, CategoryInput } from '../../../_services/admin.service';
import { ModalService } from '../../../_services/modal.service';

const categorySlug: ValidatorFn = control => typeof control.value === 'string'
  && control.value.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(control.value)
  ? null : { categorySlug: true };

const categoryName: ValidatorFn = control => typeof control.value === 'string'
  && !!control.value.trim() && control.value.trim().length <= 160
  && !/[\u0000-\u001F\u007F]/.test(control.value)
  ? null : { categoryName: true };

const categoryDescription: ValidatorFn = control => typeof control.value === 'string'
  && control.value.length <= 2000 && !/[\u0000-\u001F\u007F]/.test(control.value)
  ? null : { categoryDescription: true };

@Component({
  selector: 'website-admin-categories',
  templateUrl: './admin-categories.component.html',
  styleUrls: ['./admin-categories.component.scss'],
  standalone: true,
  imports: [ReactiveFormsModule, MatIconModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCategoriesComponent {
  private readonly admin = inject(AdminService);
  private readonly modal = inject(ModalService);
  private readonly fb = inject(FormBuilder);

  readonly categories = signal<AdminCategory[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly sessionExpired = signal(false);
  readonly showForm = signal(false);
  readonly editingId = signal<number | null>(null);

  readonly form = this.fb.nonNullable.group({
    slug: ['', categorySlug],
    name: ['', categoryName],
    description: ['', categoryDescription],
    sort_order: [1, [Validators.required, Validators.min(1), Validators.max(100000), Validators.pattern(/^\d+$/)]],
    is_active: [true],
  });
  private readonly position = toSignal(this.form.controls.sort_order.valueChanges, { initialValue: 1 });
  readonly positionOccupant = computed(() => this.categories().find(category =>
    category.sort_order === this.position() && category.id !== this.editingId()));

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    this.sessionExpired.set(false);
    try {
      this.categories.set(await this.admin.getCategories());
    } catch (error: unknown) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.admin.logout();
        this.sessionExpired.set(true);
      } else {
        this.error.set(this.errorMessage(error, 'Categories could not be loaded.'));
      }
    } finally {
      this.loading.set(false);
    }
  }

  openCreate(): void {
    this.error.set('');
    this.editingId.set(null);
    this.form.reset({ slug: '', name: '', description: '', sort_order: this.categories().length + 1, is_active: true });
    this.showForm.set(true);
  }

  openEdit(category: AdminCategory): void {
    this.error.set('');
    this.editingId.set(category.id);
    this.form.reset({
      slug: category.slug,
      name: category.name,
      description: category.description ?? '',
      sort_order: category.sort_order,
      is_active: category.is_active,
    });
    this.showForm.set(true);
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
  }

  async save(): Promise<void> {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Check the highlighted category fields before saving.');
      return;
    }
    const value = this.form.getRawValue();
    const input: CategoryInput = {
      slug: value.slug,
      name: value.name.trim(),
      description: value.description.trim() || null,
      sort_order: value.sort_order,
      is_active: value.is_active,
    };
    this.saving.set(true);
    this.error.set('');
    try {
      const id = this.editingId();
      id === null
        ? await this.admin.createCategory(input)
        : await this.admin.updateCategory({ id, ...input });
      this.cancelForm();
      try { this.categories.set(await this.admin.getCategories()); }
      catch { this.error.set('Category saved, but the list could not be refreshed. Reload the page to see the latest order.'); }
    } catch (error: unknown) {
      this.error.set(this.errorMessage(error, 'Category could not be saved.'));
    } finally {
      this.saving.set(false);
    }
  }

  async toggleActive(category: AdminCategory): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      await this.admin.updateCategory({ ...category, is_active: !category.is_active });
      try { this.categories.set(await this.admin.getCategories()); }
      catch { this.error.set('Category status changed, but the list could not be refreshed. Reload the page to see the latest order.'); }
    } catch (error: unknown) {
      this.error.set(this.errorMessage(error, 'Category status could not be changed.'));
    } finally {
      this.saving.set(false);
    }
  }

  async remove(category: AdminCategory): Promise<void> {
    const confirmed = await this.modal.confirm({
      title: 'Delete Category',
      message: `Delete "${category.name}"? Products using this category must be moved first.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    this.error.set('');
    try {
      await this.admin.deleteCategory(category.id);
      try { this.categories.set(await this.admin.getCategories()); }
      catch { this.error.set('Category deleted, but the list could not be refreshed. Reload the page to see the latest order.'); }
    } catch (error: unknown) {
      this.error.set(this.errorMessage(error, 'Category could not be deleted.'));
    }
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && typeof error.error?.error === 'string') return error.error.error;
    return fallback;
  }
}
