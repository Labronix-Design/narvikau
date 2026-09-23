import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AdminShellComponent } from './admin-shell.component';
import { AdminService } from '../../_services/admin.service';
import { websiteRoutes } from '../../website.routes';

describe('AdminShellComponent', () => {
  let fixture: ComponentFixture<AdminShellComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminShellComponent, RouterTestingModule],
      providers: [{ provide: AdminService, useValue: { logout: () => undefined } }],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminShellComponent);
  });

  it('does not expose the removed hosting route or navigation item', () => {
    const adminRoutes = websiteRoutes.find(route => route.path === 'admin')?.children ?? [];
    const navigationItems = fixture.componentInstance.navSections.flatMap(section => section.items);

    expect(adminRoutes.some(route => route.path === 'hosting')).toBeFalse();
    expect(navigationItems.some(item => item.path === '/admin/hosting')).toBeFalse();
  });
});
