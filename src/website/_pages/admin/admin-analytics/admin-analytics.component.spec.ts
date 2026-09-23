import { TestBed } from '@angular/core/testing';
import { AdminAnalyticsComponent } from './admin-analytics.component';
import { AdminService, ControlCentreResponse } from '../../../_services/admin.service';

describe('AdminAnalyticsComponent', () => {
  it('presents enquiry analytics without payment or order metrics', async () => {
    const model = {
      data: {
        enquiries: {
          status: 'ready',
          scope: { enquiries: 'All recorded canopy enquiries.' },
          enquiryCount: 8,
          newEnquiries: 3,
          contactedEnquiries: 4,
          quotedEnquiries: 2,
          convertedEnquiries: 1,
          closedEnquiries: 1,
          conversion: { numerator: 1, denominator: 8 },
          comparison: { status: 'not_measured', explanation: 'No prior period.' },
          health: { state: 'ready', label: 'Ready', explanation: 'Current.' },
        },
      },
    } as ControlCentreResponse;
    await TestBed.configureTestingModule({
      imports: [AdminAnalyticsComponent],
      providers: [{ provide: AdminService, useValue: { getControlCentre: () => Promise.resolve(model) } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(AdminAnalyticsComponent);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Total enquiries');
    expect(text).toContain('Quoted enquiries');
    expect(text.toLowerCase()).not.toContain('payment');
    expect(text.toLowerCase()).not.toContain('order');
  });
});
