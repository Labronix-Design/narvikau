import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ContactPage } from './contact.component';
import { AnalyticsService } from '../../_services/analytics.service';
import { SiteSettingsService } from '../../_services/site-settings.service';
import { ToastService } from '../../_services/toast.service';

describe('ContactPage', () => {
  let fixture: ComponentFixture<ContactPage>;
  let component: ContactPage;
  let analytics: jasmine.SpyObj<AnalyticsService>;

  beforeEach(async () => {
    analytics = jasmine.createSpyObj<AnalyticsService>('AnalyticsService', ['trackMetaLead']);
    await TestBed.configureTestingModule({
      imports: [ContactPage],
      providers: [
        { provide: AnalyticsService, useValue: analytics },
        { provide: ToastService, useValue: { showToast: jasmine.createSpy('showToast') } },
        {
          provide: SiteSettingsService,
          useValue: {
            settings: signal({ contact: { email: 'sales@example.test', phone: '', location: 'Australia', business_hours: [] } }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ContactPage);
    component = fixture.componentInstance;
  });

  it('records a Meta Lead only after a successful contact response', async () => {
    component.form.setValue({ Name: 'Alex', Surname: '', Phone: '0412345678', Email: 'alex@example.test', Message: 'Please confirm fitment.' });
    spyOn(window, 'fetch').and.resolveTo(new Response('', { status: 200 }));

    await component.onSubmit();

    expect(analytics.trackMetaLead).toHaveBeenCalledTimes(1);
  });

  it('does not record a Meta Lead when the contact response fails', async () => {
    component.form.setValue({ Name: 'Alex', Surname: '', Phone: '0412345678', Email: 'alex@example.test', Message: 'Please confirm fitment.' });
    spyOn(window, 'fetch').and.resolveTo(new Response('', { status: 500 }));

    await component.onSubmit();

    expect(analytics.trackMetaLead).not.toHaveBeenCalled();
  });
});
