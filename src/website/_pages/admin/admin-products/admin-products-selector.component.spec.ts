import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminProductsComponent } from './admin-products.component';
import { AdminCategory, AdminService } from '../../../_services/admin.service';
import { ModalService } from '../../../_services/modal.service';

describe('AdminProductsComponent category selector', () => {
  let fixture: ComponentFixture<AdminProductsComponent>;
  const categories: AdminCategory[] = [
    { id: 1, slug: 'canopy', name: 'Canopies', description: null, sort_order: 0, is_active: true },
    { id: 2, slug: 'retired', name: 'Retired', description: null, sort_order: 1, is_active: false },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminProductsComponent],
      providers: [
        provideRouter([]),
        { provide: AdminService, useValue: { getProducts: async () => [], getCategories: async () => categories } },
        { provide: ModalService, useValue: { confirm: async () => true } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminProductsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.openCreate();
    fixture.detectChanges();
  });

  it('shows active managed categories and excludes inactive ones from the new product form', () => {
    const selector = fixture.nativeElement.querySelector<HTMLSelectElement>('#product-category');
    expect(selector).not.toBeNull();
    expect([...selector!.options].map(option => option.textContent?.trim())).toContain('Canopies');
    expect([...selector!.options].map(option => option.textContent?.trim())).not.toContain('Retired');
    expect(fixture.nativeElement.querySelector<HTMLInputElement>('#product-category')).not.toBeInstanceOf(HTMLInputElement);
  });
});
