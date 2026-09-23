import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminAnalyticsComponent } from './admin-analytics.component';
import { AdminService, SalesPerformanceResponse } from '../../../_services/admin.service';

const READY_SALES: SalesPerformanceResponse = {
  status: 'ready',
  data: {
    status: 'ready',
    scope: { revenue: 'Paid revenue only.', orders: 'Paid orders only.' },
    revenueCents: 451200,
    paidOrderCount: 3,
    averagePaidOrderValueCents: 150400,
    comparison: { status: 'not_measured', explanation: 'No measured comparison period is available.' },
    health: { state: 'ready', label: 'Ready', explanation: 'Sales performance is current.' },
  },
  cache: { status: 'ready', updatedAt: '2026-08-24T10:30:00.000Z' },
};

describe('AdminAnalyticsComponent', () => {
  let fixture: ComponentFixture<AdminAnalyticsComponent>;
  let response: SalesPerformanceResponse;

  beforeEach(async () => {
    response = READY_SALES;
    await TestBed.configureTestingModule({
      imports: [AdminAnalyticsComponent],
      providers: [{ provide: AdminService, useValue: { getSalesPerformance: () => Promise.resolve(response) } }],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminAnalyticsComponent);
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('uses the sales-performance envelope and formats its cents values exactly', () => {
    expect(fixture.nativeElement.textContent).toContain('R4,512.00');
    expect(fixture.nativeElement.textContent).toContain('R1,504.00');
  });

  it('shows the server reason when no sales-performance snapshot exists', async () => {
    response = { status: 'not_measured', explanation: 'Sales performance is awaiting an authenticated refresh.', data: null, cache: { status: 'empty', updatedAt: null } };
    await fixture.componentInstance.load();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Sales performance is not measured');
    expect(fixture.nativeElement.textContent).toContain('Sales performance is awaiting an authenticated refresh.');
    expect(fixture.nativeElement.querySelectorAll('website-control-metric').length).toBe(0);
  });
});
