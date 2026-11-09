import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { AdminService, WarrantyRegistrationRecord } from '../../../_services/admin.service';
import { AdminDataTableComponent, AdminTableCellDirective } from '../../../_components/admin-data-table/admin-data-table.component';
import { AdminTableColumn } from '../../../_components/admin-data-table/admin-data-table.models';

@Component({
  selector: 'website-admin-warranties',
  standalone: true,
  imports: [CommonModule, MatIconModule, AdminDataTableComponent, AdminTableCellDirective],
  templateUrl: './admin-warranties.component.html',
  styleUrl: './admin-warranties.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminWarrantiesComponent {
  private readonly adminService = inject(AdminService);
  readonly records = signal<WarrantyRegistrationRecord[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly tableColumns: readonly AdminTableColumn<WarrantyRegistrationRecord>[] = [
    { id: 'registration', label: 'Registered', value: record => record.registration_reference, sortValue: record => record.registered_at, required: true, mobilePriority: 0 },
    { id: 'customer', label: 'Customer', value: record => record.purchaser_name, sortValue: record => record.purchaser_name, mobilePriority: 1 },
    { id: 'product', label: 'Product', value: record => record.product_name, sortValue: record => record.product_name, mobilePriority: 2 },
    { id: 'vehicle', label: 'Vehicle', value: record => `${record.vehicle_year} ${record.vehicle_make} ${record.vehicle_model}`, sortValue: record => `${record.vehicle_make} ${record.vehicle_model} ${record.vehicle_year}`, mobilePriority: 3 },
    { id: 'purchase', label: 'Purchase / fitment', value: record => this.date(record.purchase_date), sortValue: record => record.purchase_date, mobilePriority: 4 },
  ];
  readonly recordRowId = (record: WarrantyRegistrationRecord): number => record.id;

  constructor() { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try { this.records.set((await this.adminService.getWarrantyRegistrations({ limit: 100 })).items); }
    catch { this.error.set('Warranty registrations could not be loaded. Please try again.'); }
    finally { this.loading.set(false); }
  }

  date(value: string): string {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 'Not measured' : new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium' }).format(parsed);
  }
}
