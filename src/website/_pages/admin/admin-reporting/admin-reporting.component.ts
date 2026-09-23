import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { AdminService, InternalReportResponse, MonthlyBusinessReportContent, MonthlyBusinessReportResponse, MonthlyBusinessReportSendResponse } from '../../../_services/admin.service';
import { ControlStateComponent } from '../../../_components/admin-control/control-state.component';
import { ControlHealthComponent, ControlHealthState } from '../../../_components/admin-control/control-health.component';

@Component({ selector: 'website-admin-reporting', standalone: true, imports: [DatePipe, MatIconModule, ControlStateComponent, ControlHealthComponent], templateUrl: './admin-reporting.component.html', styleUrl: './admin-reporting.component.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class AdminReportingComponent {
  private readonly adminService = inject(AdminService);
  readonly model = signal<InternalReportResponse | null>(null);
  readonly monthlyReport = signal<MonthlyBusinessReportResponse | null>(null);
  readonly deliveryResult = signal<MonthlyBusinessReportSendResponse | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly monthlyError = signal('');
  readonly sendState = signal<'idle' | 'confirming' | 'sending'>('idle');
  readonly sendError = signal('');
  readonly canSendMonthlyReport = computed(() => this.monthlyReport()?.delivery.recipientConfigured === true && this.sendState() !== 'sending');
  readonly configuredRecipient = computed(() => this.monthlyReport()?.delivery.recipientConfigured === true ? 'accounts@labronix.co.za and info@navrik.co.za' : null);
  readonly reportSections = computed(() => {
    const report = this.monthlyReport()?.report;
    const sections: Array<{ key: keyof MonthlyBusinessReportContent; title: string; detail: string }> = [
      { key: 'orders', title: 'Orders & sales', detail: 'Orders, paid deposits and revenue where they are measured.' },
      { key: 'leads', title: 'Leads & conversion', detail: 'Customer enquiries and conversion coverage where connected.' },
      { key: 'search', title: 'Search & website traffic', detail: 'Search visibility and website traffic measurement where it is connected.' },
      { key: 'invoiceReadiness', title: 'Invoice readiness', detail: 'What is ready to prepare and which measurements are still missing.' },
      { key: 'measurementCoverage', title: 'Measurement coverage', detail: 'Which parts of this internal report are based on recorded data.' },
    ];
    return sections.map((section) => ({ ...section, status: this.sectionStatus(report, section.key) }));
  });
  constructor() { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    this.monthlyError.set('');
    const [history, monthly] = await Promise.allSettled([
      this.adminService.getInternalReports(),
      this.adminService.getMonthlyBusinessReport(),
    ]);
    if (history.status === 'fulfilled') this.model.set(history.value);
    else this.error.set('Internal report history could not be loaded.');
    if (monthly.status === 'fulfilled') this.monthlyReport.set(monthly.value);
    else this.monthlyError.set('The monthly report preview could not be loaded. Check the secure report configuration and try again.');
    this.loading.set(false);
  }

  async sendMonthlyReport(): Promise<void> {
    if (!this.canSendMonthlyReport()) return;
    if (this.sendState() !== 'confirming') {
      this.sendState.set('confirming');
      this.sendError.set('');
      return;
    }
    this.sendState.set('sending');
    this.sendError.set('');
    try {
      this.deliveryResult.set(await this.adminService.sendMonthlyBusinessReport());
      this.sendState.set('idle');
    } catch {
      this.sendError.set('The report was not sent. Check the internal email configuration and try again.');
      this.sendState.set('confirming');
    }
  }

  cancelSend(): void { this.sendState.set('idle'); this.sendError.set(''); }

  sectionStatus(report: MonthlyBusinessReportContent | undefined, key: keyof MonthlyBusinessReportContent): string {
    const section = report?.[key];
    const explanation = typeof section?.['explanation'] === 'string' ? section['explanation'] : null;
    if (explanation) return explanation;
    const status = typeof section?.['status'] === 'string' ? section['status'] : '';
    if (status === 'ready') return 'Measured data will be included.';
    if (status) return 'Not measured yet.';
    return 'Included when measured data is available.';
  }

  sectionHealth(report: MonthlyBusinessReportContent | undefined, key: keyof MonthlyBusinessReportContent): ControlHealthState {
    const status = report?.[key]?.['status'];
    if (status === 'ready') return 'ready';
    if (status === 'error' || status === 'action_required') return 'action-required';
    if (status === 'stale' || status === 'attention') return 'attention';
    return 'not-measured';
  }
}
