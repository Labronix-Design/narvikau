import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminService, WarrantyRegistrationRecord } from '../../../_services/admin.service';
import { AdminWarrantiesComponent } from './admin-warranties.component';

describe('Admin warranty registrations', () => {
  let fixture: ComponentFixture<AdminWarrantiesComponent>;
  let service: jasmine.SpyObj<AdminService>;
  const record: WarrantyRegistrationRecord = {
    id: 1, registration_reference: 'WAR-001', purchaser_name: 'Alex',
    purchaser_email: 'alex@example.test', purchaser_phone: '0412345678', product_id: 3,
    product_name: 'Canopy', purchase_reference: null, vehicle_make: 'Ford',
    vehicle_model: 'Ranger', vehicle_year: 2024, vehicle_registration: 'ABC123',
    purchase_date: '2026-10-01', fitment_date: '2026-10-03',
    consent_at: '2026-10-04T00:00:00.000Z', registered_at: '2026-10-04T00:00:00.000Z',
  };

  beforeEach(async () => {
    service = jasmine.createSpyObj('AdminService', ['getWarrantyRegistrations']);
    service.getWarrantyRegistrations.and.resolveTo({ items: [record] } as never);
    await TestBed.configureTestingModule({
      imports: [AdminWarrantiesComponent],
      providers: [{ provide: AdminService, useValue: service }],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminWarrantiesComponent);
  });

  it('shows display-only configurable columns with sortable registration and customer', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const table = fixture.nativeElement.querySelector('website-admin-data-table');
    expect(table).not.toBeNull();
    expect(table.querySelector('th[data-column="registration"] .mono')?.textContent).toContain('WAR-001');
    expect(table.querySelector('tbody [data-column="customer"]')?.textContent).toContain('Alex');
    expect(table.querySelectorAll('button.adt-sort').length).toBeGreaterThan(0);
    expect(table.querySelector('details.adt-chooser')).not.toBeNull();
    expect(table.querySelector('button.adm-btn')).toBeNull();
  });

  it('sorts warranty registrations by customer name', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.records.set([record, { ...record, id: 2, registration_reference: 'WAR-002', purchaser_name: 'Aaron' }]);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('th[data-column="customer"] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const names = [...fixture.nativeElement.querySelectorAll('tbody tr.adt-data-row [data-column="customer"]')]
      .map((cell: Element) => cell.textContent?.trim());
    expect(names[0]).toContain('Aaron');
    expect(names[1]).toContain('Alex');
  });
});
