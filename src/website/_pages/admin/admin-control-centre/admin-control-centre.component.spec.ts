import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminControlCentreComponent } from './admin-control-centre.component';
import { AdminService, ControlCentreResponse } from '../../../_services/admin.service';

const READY_OVERVIEW: ControlCentreResponse = {
  data: {
    business_overview: {
      status: 'ready',
      scope: { orders: 'Recorded orders.', revenue: 'Paid revenue only.', enquiries: 'Recorded enquiries.' },
      revenueCents: 451200,
      paidOrderCount: 3,
      orderCount: 4,
      ordersInProduction: 1,
      enquiryCount: 2,
      newEnquiries: 1,
      conversion: { numerator: 1, denominator: 2 },
      comparison: { status: 'not_measured', explanation: 'No measured comparison period is available.' },
      actions: [{ key: 'follow_up_new_enquiries', explanation: '1 new enquiry needs follow-up.' }],
      health: { state: 'attention', label: 'Needs attention', explanation: 'New customer enquiries need follow-up.' },
    },
    sales_performance: { status: 'not_measured', explanation: 'Sales performance has not been cached yet.' },
    orders: { status: 'not_measured', explanation: 'Orders have not been cached yet.' },
    enquiries: { status: 'not_measured', explanation: 'Customer enquiries have not been cached yet.' },
    search: { status: 'not_measured', explanation: 'Search Console has not been measured yet.' },
  },
  cache: { status: 'ready', updatedAt: '2026-08-24T10:30:00.000Z' },
  sections: { business_overview: 'ready', search: 'not_measured' },
};

describe('AdminControlCentreComponent', () => {
  let fixture: ComponentFixture<AdminControlCentreComponent>;
  let response: ControlCentreResponse;

  beforeEach(async () => {
    response = READY_OVERVIEW;
    await TestBed.configureTestingModule({
      imports: [AdminControlCentreComponent],
      providers: [{
        provide: AdminService,
        useValue: {
          getControlCentre: () => Promise.resolve(response),
          refreshControlCentre: () => Promise.resolve({ section: 'business_overview' }),
        },
      }],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminControlCentreComponent);
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('renders the business_overview snapshot rather than the retired business section', () => {
    expect(fixture.nativeElement.textContent).toContain('R4,512.00');
    expect(fixture.nativeElement.textContent).toContain('Follow up new enquiries');
    expect(fixture.componentInstance.integrationCards()[1].health).toBe('not-measured');
  });

  it('shows the server not-measured reason instead of empty overview metrics', async () => {
    response = {
      ...READY_OVERVIEW,
      data: { ...READY_OVERVIEW.data, business_overview: { status: 'not_measured', explanation: 'Business overview is awaiting an authenticated refresh.' } },
    };
    await fixture.componentInstance.load();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Business overview is not measured');
    expect(fixture.nativeElement.textContent).toContain('Business overview is awaiting an authenticated refresh.');
    expect(fixture.nativeElement.querySelectorAll('website-control-metric').length).toBe(0);
  });
});
