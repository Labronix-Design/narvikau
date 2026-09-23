import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AdminService, BusinessOverviewSnapshot, ControlCentreResponse, ControlMetricData } from '../../../_services/admin.service';
import { ControlMetricComponent } from '../../../_components/admin-control/control-metric.component';
import { ControlStateComponent } from '../../../_components/admin-control/control-state.component';
import { ControlHealthComponent, ControlHealthState } from '../../../_components/admin-control/control-health.component';

interface RecommendedAction { title: string; detail: string; route?: string; priority?: 'high' | 'normal'; }
interface PulseMetric extends ControlMetricData { icon: string; route: string | null; }
interface IntegrationCard { id: 'business_overview' | 'search'; label: string; provider: string; icon: string; health: ControlHealthState; detail: string; route: string; action: string; }

const INTEGRATION_META = [
  { id: 'business_overview' as const, label: 'Business overview data', provider: 'Business snapshots', icon: 'business', route: '/admin/orders', action: 'Review sales and orders' },
  { id: 'search' as const, label: 'Search and traffic data', provider: 'Google', icon: 'search', route: '/admin/search-visibility', action: 'Open search and traffic' },
];

@Component({
  selector: 'website-admin-control-centre',
  standalone: true,
  imports: [DatePipe, MatIconModule, RouterLink, ControlMetricComponent, ControlStateComponent, ControlHealthComponent],
  templateUrl: './admin-control-centre.component.html',
  styleUrl: './admin-control-centre.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminControlCentreComponent {
  private readonly adminService = inject(AdminService);
  readonly model = signal<ControlCentreResponse | null>(null);
  readonly loading = signal(true);
  readonly refreshing = signal(false);
  readonly error = signal('');
  readonly business = computed(() => this.model()?.data.business_overview);
  readonly businessSnapshot = computed<BusinessOverviewSnapshot | null>(() => {
    const business = this.business();
    return business?.status === 'ready' ? business : null;
  });
  readonly businessNotMeasuredReason = computed(() => {
    const business = this.business();
    return business?.status === 'not_measured' ? business.explanation : 'The server has not produced a business overview snapshot yet.';
  });
  readonly metrics = computed<PulseMetric[]>(() => {
    const business = this.businessSnapshot();
    if (!business) return [];
    const conversion = business.conversion.denominator > 0 ? (business.conversion.numerator / business.conversion.denominator) * 100 : null;
    return [
      { label: 'Paid or confirmed revenue', icon: 'payments', value: business.revenueCents, format: 'currency', context: business.scope.revenue, tone: 'accent', route: '/admin/orders' },
      { label: 'Recorded orders', icon: 'receipt_long', value: business.orderCount, context: business.scope.orders, route: '/admin/orders' },
      { label: 'New enquiries', icon: 'forum', value: business.newEnquiries, context: business.scope.enquiries, tone: 'warning', route: '/admin/queries' },
      { label: 'Enquiry conversion', icon: 'bar_chart', value: conversion, format: 'percent', context: 'Converted enquiries divided by recorded enquiries.', unavailableReason: 'Conversion needs recorded enquiries and converted enquiries.', tone: 'success', route: '/admin/queries' },
    ];
  });
  readonly actions = computed<RecommendedAction[]>(() => this.businessSnapshot()?.actions.map(action => ({
    title: this.actionTitle(action.key),
    detail: action.explanation,
    route: action.key === 'follow_up_new_enquiries' ? '/admin/queries' : action.key === 'review_production_orders' ? '/admin/orders' : undefined,
    priority: action.key === 'follow_up_new_enquiries' ? 'high' : 'normal',
  })) ?? []);
  readonly integrationCards = computed<IntegrationCard[]>(() => INTEGRATION_META.map(meta => {
    const section = this.model()?.sections?.[meta.id] ?? this.model()?.data[meta.id]?.status ?? 'not_measured';
    const data = this.model()?.data[meta.id];
    const explanation = data && 'explanation' in data && typeof data.explanation === 'string' ? data.explanation : undefined;
    const detail = section === 'stale' ? 'The last saved snapshot needs a secure refresh.' : explanation ?? this.snapshotDetail(meta.label, section);
    const health = section === 'ready' ? 'ready' : section === 'stale' ? 'attention' : section === 'setup' || section === 'setup_required' ? 'action-required' : 'not-measured';
    return { ...meta, health, detail };
  }));

  constructor() { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try { this.model.set(await this.adminService.getControlCentre()); }
    catch { this.error.set('Your business overview could not be loaded. Please try again.'); }
    finally { this.loading.set(false); }
  }

  async refresh(): Promise<void> {
    this.refreshing.set(true);
    try {
      await this.adminService.refreshControlCentre('business_overview');
      this.model.set(await this.adminService.getControlCentre());
    } catch {
      this.error.set('The server could not refresh this view. Your last saved data has not been changed.');
    } finally {
      this.refreshing.set(false);
    }
  }

  private actionTitle(key: string): string {
    if (key === 'follow_up_new_enquiries') return 'Follow up new enquiries';
    if (key === 'review_production_orders') return 'Review production orders';
    return 'Keep measurement current';
  }

  private snapshotDetail(label: string, status: string): string {
    if (status === 'ready') return `${label} is available in the latest secure snapshot.`;
    return 'Not measured yet. The server has not produced a usable snapshot for this area.';
  }
}
