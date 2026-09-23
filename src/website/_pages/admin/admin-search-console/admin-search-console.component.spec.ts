import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminSearchConsoleComponent } from './admin-search-console.component';
import { AdminService } from '../../../_services/admin.service';

describe('AdminSearchConsoleComponent', () => {
  let fixture: ComponentFixture<AdminSearchConsoleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminSearchConsoleComponent],
      providers: [{
        provide: AdminService,
        useValue: {
          getSearchConsole: () => Promise.resolve({
            status: 'setup_required',
            explanation: 'Google Search Console is not connected yet.',
            missingConfiguration: [],
            integration: { property: 'sc-domain:navrik.co.za' },
          }),
          getSearchConsoleConnectionUrl: () => Promise.resolve({ authorizationUrl: 'https://accounts.google.com/example' }),
          refreshSearchConsole: () => Promise.resolve({ status: 'ready', data: {} }),
        },
      }],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminSearchConsoleComponent);
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('offers a Google connection only when setup has no missing server configuration', () => {
    expect(fixture.componentInstance.showConnectAction()).toBeTrue();

    fixture.componentInstance.model.set({
      status: 'setup_required',
      missingConfiguration: ['GSC_OAUTH_CLIENT_ID'],
    });

    expect(fixture.componentInstance.showConnectAction()).toBeFalse();
  });

  it('summarises the previous Search Console period without rendering an object', () => {
    fixture.componentInstance.model.set({
      status: 'ready',
      data: { comparison: { clicks: 24, impressions: 229 } },
    });

    expect(fixture.componentInstance.comparisonSummary()).toBe('Previous comparable period: 24 clicks and 229 impressions.');
  });
});
