import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { AdminCategoriesComponent } from './admin-categories.component';
import { AdminCategory, AdminService } from '../../../_services/admin.service';
import { ModalService } from '../../../_services/modal.service';

describe('AdminCategoriesComponent', () => {
  let fixture: ComponentFixture<AdminCategoriesComponent>;
  const categories: AdminCategory[] = [
    { id: 1, slug: 'canopy', name: 'Canopies', description: null, sort_order: 0, is_active: true },
  ];
  const service = {
    getCategories: jasmine.createSpy('getCategories').and.callFake(async () => [...categories]),
    createCategory: jasmine.createSpy('createCategory').and.callFake(async (value: AdminCategory) => ({ ...value, id: 2 })),
    updateCategory: jasmine.createSpy('updateCategory').and.callFake(async (value: AdminCategory) => value),
    deleteCategory: jasmine.createSpy('deleteCategory').and.resolveTo({ ok: true }),
    logout: jasmine.createSpy('logout'),
  };

  beforeEach(async () => {
    service.getCategories.calls.reset();
    service.createCategory.calls.reset();
    service.updateCategory.calls.reset();
    service.deleteCategory.calls.reset();
    service.deleteCategory.and.resolveTo({ ok: true });
    await TestBed.configureTestingModule({
      imports: [AdminCategoriesComponent],
      providers: [
        { provide: AdminService, useValue: service },
        { provide: ModalService, useValue: { confirm: async () => true } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminCategoriesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('lists managed categories and creates one from valid fields', async () => {
    expect(fixture.nativeElement.textContent).toContain('Canopies');
    fixture.componentInstance.openCreate();
    fixture.componentInstance.form.patchValue({ slug: 'roof-equipment', name: 'Roof Equipment', sort_order: 1 });
    await fixture.componentInstance.save();
    expect(service.createCategory).toHaveBeenCalledWith(jasmine.objectContaining({ slug: 'roof-equipment', name: 'Roof Equipment' }));
    expect(fixture.componentInstance.categories().map(category => category.name)).toContain('Roof Equipment');
  });

  it('edits a category and toggles its active status', async () => {
    fixture.componentInstance.openEdit(categories[0]);
    fixture.componentInstance.form.controls.name.setValue('Canopy Systems');
    await fixture.componentInstance.save();
    expect(service.updateCategory).toHaveBeenCalledWith(jasmine.objectContaining({ id: 1, name: 'Canopy Systems' }));
    await fixture.componentInstance.toggleActive(categories[0]);
    expect(service.updateCategory).toHaveBeenCalledWith(jasmine.objectContaining({ id: 1, is_active: false }));
  });

  it('shows a deletion conflict and keeps the category', async () => {
    service.deleteCategory.and.rejectWith(new HttpErrorResponse({ status: 409, error: { error: 'This category is in use by products' } }));
    await fixture.componentInstance.remove(categories[0]);
    expect(fixture.componentInstance.error()).toContain('in use by products');
    expect(fixture.componentInstance.categories().length).toBe(1);
  });

  it('rejects an invalid category before submission', async () => {
    fixture.componentInstance.openCreate();
    fixture.componentInstance.form.patchValue({ slug: 'Bad Slug', name: 'Roof Equipment' });
    await fixture.componentInstance.save();
    expect(service.createCategory).not.toHaveBeenCalled();
  });

  it('identifies each category row and its actions to assistive technology', () => {
    const row = fixture.nativeElement.querySelector<HTMLTableRowElement>('tbody tr');
    expect(row?.querySelector('th[scope="row"]')?.textContent).toContain('Canopies');
    const actions = [...(row?.querySelectorAll<HTMLButtonElement>('.category-actions button') ?? [])];
    expect(actions.map(button => button.getAttribute('aria-label'))).toEqual([
      'Edit Canopies', 'Deactivate Canopies', 'Delete Canopies',
    ]);
  });

  it('associates the sort-order validation message with its input', () => {
    fixture.componentInstance.openCreate();
    fixture.componentInstance.form.controls.sort_order.setValue(100001);
    fixture.componentInstance.form.controls.sort_order.markAsTouched();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector<HTMLInputElement>('#category-sort');
    const error = fixture.nativeElement.querySelector<HTMLElement>('#category-sort-error');
    expect(input?.getAttribute('aria-invalid')).toBe('true');
    expect(input?.getAttribute('aria-describedby')).toContain('category-sort-error');
    expect(error?.textContent).toContain('Enter a whole number');
  });
});
