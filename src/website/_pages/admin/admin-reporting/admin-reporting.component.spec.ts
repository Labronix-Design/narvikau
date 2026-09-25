import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminService, MonthlyBusinessReportResponse, MonthlyBusinessReportSendResponse } from '../../../_services/admin.service';
import { AdminReportingComponent } from './admin-reporting.component';

const REPORTING_PERIOD = { label: 'August 2026', startDate: '2026-08-01', endDate: '2026-08-24', complete: false };
const CONFIGURED_RECIPIENT = 'accounts@labronix.co.za (internal) and info@navrik.com.au';
const REPORT_CONTENT = { orders: {}, leads: {}, search: {}, hosting: {}, invoiceReadiness: {}, measurementCoverage: {} };

function reportPreview(recipientConfigured: boolean): MonthlyBusinessReportResponse {
  return {
    reportType: 'monthly_business',
    period: REPORTING_PERIOD,
    report: REPORT_CONTENT,
    delivery: { status: recipientConfigured ? 'not_sent' : 'setup_required', recipientConfigured },
  };
}

function deliveryResult(status: 'sent' | 'already_sent'): MonthlyBusinessReportSendResponse {
  return {
    status,
    period: REPORTING_PERIOD,
    delivery: { recipient: CONFIGURED_RECIPIENT, sentAt: '2026-08-24T04:00:00.000Z' },
    report: REPORT_CONTENT,
  };
}

describe('AdminReportingComponent', () => {
  let fixture: ComponentFixture<AdminReportingComponent>;
  let adminService: jasmine.SpyObj<AdminService>;

  beforeEach(async () => {
    adminService = jasmine.createSpyObj<AdminService>('AdminService', ['getInternalReports', 'getMonthlyBusinessReport', 'sendMonthlyBusinessReport']);
    adminService.getInternalReports.and.resolveTo({ reports: [] });
    adminService.getMonthlyBusinessReport.and.resolveTo(reportPreview(true));
    adminService.sendMonthlyBusinessReport.and.resolveTo(deliveryResult('sent'));

    await TestBed.configureTestingModule({
      imports: [AdminReportingComponent],
      providers: [{ provide: AdminService, useValue: adminService }],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminReportingComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('shows the current period and recipient only when server configuration confirms delivery', () => {
    expect(fixture.nativeElement.textContent).toContain(REPORTING_PERIOD.label);
    expect(fixture.nativeElement.textContent).toContain('Completed calendar month');
    expect(fixture.nativeElement.textContent).toContain(CONFIGURED_RECIPIENT);
    expect(fixture.nativeElement.textContent).toContain('Configured internal recipient');
  });

  it('requires confirmation before sending the current month report', async () => {
    const component = fixture.componentInstance;

    await component.sendMonthlyReport();
    expect(adminService.sendMonthlyBusinessReport).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Confirm send');

    await component.sendMonthlyReport();
    expect(adminService.sendMonthlyBusinessReport).toHaveBeenCalledOnceWith();
    expect(fixture.nativeElement.textContent).toContain('Sent internally');
    expect(fixture.nativeElement.textContent).toContain(CONFIGURED_RECIPIENT);
  });

  it('keeps the send action unavailable and hides the recipient when delivery setup is incomplete', async () => {
    adminService.getMonthlyBusinessReport.and.resolveTo(reportPreview(false));
    await fixture.componentInstance.load();
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector<HTMLButtonElement>('[data-testid="send-monthly-report"]');
    expect(button?.disabled).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Setup required');
    expect(fixture.nativeElement.textContent).toContain('Delivery stays disabled until the server confirms a configured internal recipient.');
    expect(fixture.nativeElement.textContent).not.toContain(CONFIGURED_RECIPIENT);
  });

  it('shows an already-sent state only when the server reports it', async () => {
    adminService.sendMonthlyBusinessReport.and.resolveTo(deliveryResult('already_sent'));

    await fixture.componentInstance.sendMonthlyReport();
    await fixture.componentInstance.sendMonthlyReport();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Already sent internally');
    expect(fixture.nativeElement.textContent).toContain(CONFIGURED_RECIPIENT);
  });

  it('presents only enquiry and website operations reporting', () => {
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('Canopy enquiries');
    expect(text).toContain('Search & website traffic');
    expect(text).toContain('Website operations');
    expect(text).toContain('Measurement coverage');
    expect(text).not.toContain('Orders & sales');
    expect(text).not.toContain('paid deposits');
    expect(text).not.toContain('revenue');
    expect(text).not.toContain('Sales performance');
    expect(text).not.toContain('Invoice readiness');
  });
});
