import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { AdminLoginComponent } from './admin-login.component';
import { AdminService } from '../../../_services/admin.service';
import { SiteSettingsService } from '../../../_services/site-settings.service';

describe('AdminLoginComponent branding', () => {
  let fixture: ComponentFixture<AdminLoginComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminLoginComponent],
      providers: [
        provideRouter([]),
        { provide: AdminService, useValue: { login: async () => 'token' } },
        {
          provide: SiteSettingsService,
          useValue: {
            settings: signal({ logo_url: '/uploads/navrik-login-logo.svg' }),
            uploadVariantUrl: (url: string) => url,
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminLoginComponent);
  });

  it('uses the configured site logo before authentication', () => {
    fixture.detectChanges();

    const logo = fixture.nativeElement.querySelector<HTMLImageElement>('.admin-brand-logo');
    expect(logo?.src).toContain('/uploads/navrik-login-logo.svg');
    expect(logo?.alt).toBe('Navrik');
  });
});
