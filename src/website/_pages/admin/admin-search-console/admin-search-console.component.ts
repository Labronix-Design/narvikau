import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { AdminService, ControlMetricData, SearchConsoleResponse } from '../../../_services/admin.service';
import { ControlMetricComponent } from '../../../_components/admin-control/control-metric.component';
import { ControlStateComponent } from '../../../_components/admin-control/control-state.component';
import { ControlHealthComponent, ControlHealthState } from '../../../_components/admin-control/control-health.component';

@Component({ selector: 'website-admin-search-console', standalone: true, imports: [DatePipe, MatIconModule, ControlMetricComponent, ControlStateComponent, ControlHealthComponent], templateUrl: './admin-search-console.component.html', styleUrl: './admin-search-console.component.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class AdminSearchConsoleComponent {
  private readonly adminService = inject(AdminService);
  readonly model = signal<SearchConsoleResponse | null>(null); readonly loading = signal(true); readonly refreshing = signal(false); readonly connecting = signal(false); readonly error = signal('');
  readonly searchMetrics = computed<ControlMetricData[]>(() => {
    const data = this.model()?.data;
    const raw = data?.metrics as unknown as { clicks?: number; impressions?: number; ctr?: number; averagePosition?: number } | undefined;
    if (!raw || Array.isArray(raw)) return Array.isArray(data?.metrics) ? data.metrics : [];
    return [
      { label: 'Clicks', value: raw.clicks ?? null, context: 'Google Search clicks in the latest period.' },
      { label: 'Impressions', value: raw.impressions ?? null, context: 'Search appearances in the latest period.' },
      { label: 'Click-through rate', value: raw.ctr === undefined ? null : raw.ctr * 100, format: 'percent', context: 'Clicks divided by impressions.' },
      { label: 'Average position', value: raw.averagePosition ?? null, context: 'Lower positions are generally better.' },
    ];
  });
  readonly websiteMetrics = computed<ControlMetricData[]>(() => {
    const metrics = this.model()?.data?.websiteAnalytics?.metrics;
    if (!metrics) return [];
    return [
      { label: 'Active users', value: metrics.activeUsers ?? null, context: 'Measured GA4 users in the latest period.' },
      { label: 'Sessions', value: metrics.sessions ?? null, context: 'Measured GA4 visits in the latest period.' },
      { label: 'Page views', value: metrics.pageViews ?? null, context: 'Measured GA4 page views in the latest period.' },
      { label: 'Key events', value: metrics.keyEvents ?? null, context: 'GA4 events marked as key events.' },
    ];
  });
  readonly hasMissingConfiguration = computed(() => (this.model()?.missingConfiguration?.length ?? 0) > 0);
  readonly showConnectAction = computed(() => this.model()?.status === 'setup_required' && !this.hasMissingConfiguration());
  readonly showRefreshAction = computed(() => this.model()?.status === 'ready' || (this.model()?.status === 'not_measured' && this.model()?.explanation?.includes('refreshed') === true));
  readonly staleNotice = computed(() => this.model()?.cache?.status === 'stale' ? 'Showing the last saved Google snapshot while a secure refresh is needed.' : '');
  readonly comparisonSummary = computed(() => {
    const comparison = this.model()?.data?.comparison;
    if (!comparison || typeof comparison !== 'object' || Array.isArray(comparison)) return '';
    const values = comparison as { clicks?: unknown; impressions?: unknown; ctr?: unknown; averagePosition?: unknown };
    const clicks = typeof values.clicks === 'number' ? new Intl.NumberFormat('en-AU').format(values.clicks) : null;
    const impressions = typeof values.impressions === 'number' ? new Intl.NumberFormat('en-AU').format(values.impressions) : null;
    if (!clicks && !impressions) return '';
    return `Previous comparable period: ${clicks ?? '—'} clicks and ${impressions ?? '—'} impressions.`;
  });
  readonly setupTitle = computed(() => this.hasMissingConfiguration() ? 'Google Search Console needs secure setup' : 'Connect Google Search Console');
  readonly setupMessage = computed(() => this.model()?.explanation || 'An administrator must complete the secure Google connection before search data can be shown.');
  constructor() { void this.load(); }
  async load(): Promise<void> { this.loading.set(true); this.error.set(''); try { this.model.set(await this.adminService.getSearchConsole()); } catch { this.error.set('Search visibility could not be loaded.'); } finally { this.loading.set(false); } }
  async refresh(): Promise<void> { this.refreshing.set(true); try { this.model.set(await this.adminService.refreshSearchConsole()); } catch { this.error.set('The secure Search Console refresh did not complete.'); } finally { this.refreshing.set(false); } }
  async connect(): Promise<void> {
    this.connecting.set(true); this.error.set('');
    try {
      const { authorizationUrl } = await this.adminService.getSearchConsoleConnectionUrl();
      window.location.assign(authorizationUrl);
    } catch {
      this.error.set('The secure Google connection could not be started.');
      this.connecting.set(false);
    }
  }
  readonly canReconnectAnalytics = computed(() => {
    const status = this.model()?.data?.websiteAnalytics?.status;
    return status === 'setup_required' || status === 'not_measured';
  });
  readonly searchHealth = computed<ControlHealthState>(() => this.model()?.status === 'ready' ? (this.model()?.cache?.status === 'stale' ? 'attention' : 'ready') : this.hasMissingConfiguration() ? 'action-required' : 'not-measured');
  readonly websiteHealth = computed<ControlHealthState>(() => this.model()?.data?.websiteAnalytics?.status === 'ready' ? 'ready' : 'not-measured');
}
