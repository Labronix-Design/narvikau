import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { AdminService, ControlMetricData, SalesPerformanceResponse, SalesPerformanceSnapshot } from '../../../_services/admin.service';
import { ControlMetricComponent } from '../../../_components/admin-control/control-metric.component';
import { ControlStateComponent } from '../../../_components/admin-control/control-state.component';
import { ControlHealthComponent } from '../../../_components/admin-control/control-health.component';

interface SalesMetric extends ControlMetricData { icon: string; }

@Component({
  selector: 'website-admin-analytics',
  standalone: true,
  imports: [DatePipe, MatIconModule, ControlMetricComponent, ControlStateComponent, ControlHealthComponent],
  templateUrl: './admin-analytics.component.html',
  styleUrl: './admin-analytics.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAnalyticsComponent {
  private readonly adminService = inject(AdminService);

  readonly model = signal<SalesPerformanceResponse | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly snapshot = computed<SalesPerformanceSnapshot | null>(() => this.model()?.status === 'ready' ? this.model()?.data ?? null : null);
  readonly metrics = computed<SalesMetric[]>(() => {
    const snapshot = this.snapshot();
    if (!snapshot) return [];
    return [
      { label: 'Paid or confirmed revenue', icon: 'payments', value: snapshot.revenueCents, format: 'currency', context: snapshot.scope.revenue, tone: 'accent' },
      { label: 'Paid or confirmed orders', icon: 'receipt_long', value: snapshot.paidOrderCount, context: snapshot.scope.orders, tone: 'success' },
      { label: 'Average paid order value', icon: 'price_check', value: snapshot.averagePaidOrderValueCents, format: 'currency', context: 'Paid or confirmed revenue divided by paid or confirmed orders.' },
    ];
  });

  constructor() { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try { this.model.set(await this.adminService.getSalesPerformance()); }
    catch { this.error.set('Sales performance could not be loaded. Please try again.'); }
    finally { this.loading.set(false); }
  }
}
