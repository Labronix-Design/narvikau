import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { AdminService, WarrantyRegistrationRecord } from '../../../_services/admin.service';

@Component({
  selector: 'website-admin-warranties',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './admin-warranties.component.html',
  styleUrl: './admin-warranties.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminWarrantiesComponent {
  private readonly adminService = inject(AdminService);
  readonly records = signal<WarrantyRegistrationRecord[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

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
