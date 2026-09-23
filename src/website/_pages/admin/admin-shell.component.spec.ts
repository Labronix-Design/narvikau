import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AdminShellComponent } from './admin-shell.component';
import { AdminService } from '../../_services/admin.service';
import { websiteRoutes } from '../../website.routes';

describe('AdminShellComponent canopies-only navigation', () => {
  let fixture: ComponentFixture<AdminShellComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminShellComponent, RouterTestingModule],
      providers: [{ provide: AdminService, useValue: { logout: () => undefined } }],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminShellComponent);
  });

  it('omits retired commerce and catalogue areas while retaining supported administration', () => {
    const navigationItems = fixture.componentInstance.navSections.flatMap(section => section.items);
    const labels = navigationItems.map(item => item.label);
    const paths = navigationItems.map(item => item.path);

    expect(labels).not.toContain('Sales & orders');
    expect(labels).not.toContain('Orders');
    expect(labels).not.toContain('Vouchers');
    expect(labels).not.toContain('Accessories');
    expect(labels).not.toContain('Compatibility');
    expect(labels).not.toContain('Categories');
    expect(labels).not.toContain('Finance Page');
    expect(labels.some(label => label.includes('Sales'))).toBeFalse();

    expect(paths).toContain('/admin/warranties');
    expect(paths).toContain('/admin/products');
    expect(paths).toContain('/admin/analytics');
    expect(paths).toContain('/admin/settings');
    expect(paths).toContain('/admin/legal-pages');
  });

  it('redirects retired public routes and does not register retired admin routes', () => {
    const accessories = websiteRoutes.find(route => route.path === 'accessories');
    const finance = websiteRoutes.find(route => route.path === 'finance');
    const adminRoutes = websiteRoutes.find(route => route.path === 'admin')?.children ?? [];
    const retiredAdminPaths = ['orders', 'accessories', 'compatibility', 'categories', 'coupons', 'finance-content'];

    expect(accessories).toEqual(jasmine.objectContaining({ redirectTo: 'products', pathMatch: 'full' }));
    expect(finance).toEqual(jasmine.objectContaining({ redirectTo: 'products', pathMatch: 'full' }));
    expect(adminRoutes.some(route => retiredAdminPaths.includes(route.path ?? ''))).toBeFalse();
  });
});
