import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { AdminService, OrderSummary, WarrantyRegistrationRecord } from '../../../_services/admin.service';
import { ToastService } from '../../../_services/toast.service';

interface OrderRecord {
  order_id: number;
  order_date?: string;
  customer_name?: string;
  customer_email?: string;
  product_label?: string;
  status: string;
  total_incl_vat_cents?: number | string | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending payment', deposit_paid: 'Deposit paid', in_production: 'In production',
  ready: 'Ready for fitment', completed: 'Completed', cancelled: 'Cancelled', failed: 'Failed',
};

@Component({
  selector: 'website-admin-dashboard',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboardComponent {
  private readonly adminService = inject(AdminService);
  private readonly toast = inject(ToastService);

  readonly summary = signal<OrderSummary | null>(null);
  readonly recentOrders = signal<OrderRecord[]>([]);
  readonly recentWarranties = signal<WarrantyRegistrationRecord[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly updatingOrderId = signal<number | null>(null);
  readonly statusLabels = STATUS_LABELS;
  readonly statusOptions = [
    { value: 'pending', label: 'Pending payment' }, { value: 'deposit_paid', label: 'Deposit paid' },
    { value: 'in_production', label: 'In production' }, { value: 'ready', label: 'Ready for fitment' },
    { value: 'completed', label: 'Completed' },
  ];

  constructor() { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [summary, orders, warranties] = await Promise.all([
        this.adminService.getOrderSummary(),
        this.adminService.getOrders({ limit: 50 }),
        this.adminService.getWarrantyRegistrations({ limit: 5 }),
      ]);
      this.summary.set(summary);
      this.recentOrders.set(orders as OrderRecord[]);
      this.recentWarranties.set(warranties.items);
    } catch {
      this.error.set('Sales and orders could not be loaded. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  async updateStatus(orderId: number, status: string): Promise<void> {
    this.updatingOrderId.set(orderId);
    try {
      await this.adminService.updateOrderStatus(orderId, status);
      this.recentOrders.update(orders => orders.map(order => order.order_id === orderId ? { ...order, status } : order));
      this.toast.showToast({ message: 'Order status updated.', type: 'success' });
    } catch {
      this.toast.showToast({ message: 'Order status could not be updated.', type: 'error' });
    } finally {
      this.updatingOrderId.set(null);
    }
  }

  updateStatusFromEvent(orderId: number, event: Event): void {
    const status = (event.target as HTMLSelectElement).value;
    void this.updateStatus(orderId, status);
  }

  statusLabel(status: string): string { return STATUS_LABELS[status] || status; }

  orderTotal(order: OrderRecord): string {
    const cents = Number(order.total_incl_vat_cents);
    if (!Number.isSafeInteger(cents) || cents < 0) return 'Not measured';
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(cents / 100);
  }

  warrantyDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Date not measured' : new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium' }).format(date);
  }
}
