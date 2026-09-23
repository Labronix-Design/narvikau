import { Routes } from '@angular/router';
import { adminAuthGuard } from './_guards/admin-auth.guard';

export const websiteRoutes: Routes = [
  {
    path: '',
    title: 'Navrik | Trays, Canopies & Accessories',
    loadComponent: () => import('./_pages/main/main.component').then(m => m.MainPage)
  },
  {
    path: 'privacy',
    title: 'Privacy Notice | navrik',
    loadComponent: () => import('./_pages/privacy-notice/privacy-notice.component').then(m => m.PrivacyNoticePage)
  },
  {
    path: 'terms',
    title: 'Terms of Service | navrik',
    loadComponent: () => import('./_pages/terms-of-service/terms-of-service.component').then(m => m.TermsOfServicePage)
  },
  {
    path: 'products',
    title: 'Products | Navrik Bakkie Trays',
    loadComponent: () => import('./_pages/products/products.component').then(m => m.ProductsPage)
  },
  {
    path: 'accessories',
    title: 'Accessories | Navrik',
    loadComponent: () => import('./_pages/accessories/accessories.component').then(m => m.AccessoriesPage)
  },
  {
    path: 'products/:slug',
    title: 'Product | Navrik Bakkie Trays',
    loadComponent: () => import('./_pages/products/product-detail/product-detail.component').then(m => m.ProductDetailPage)
  },
  {
    path: 'refund-policy',
    title: 'Refund & Warranty Policy | Navrik',
    loadComponent: () => import('./_pages/refund-policy/refund-policy.component').then(m => m.RefundPolicyPage)
  },
  {
    path: 'register-warranty',
    title: 'Register Your Warranty | Navrik',
    loadComponent: () => import('./_pages/warranty-registration/warranty-registration.component').then(m => m.WarrantyRegistrationPage)
  },
  {
    path: 'finance',
    title: 'Finance with ABSA | Navrik',
    loadComponent: () => import('./_pages/finance/finance.component').then(m => m.FinancePage)
  },
  {
    path: 'contact',
    title: 'Contact | Navrik',
    loadComponent: () => import('./_pages/contact/contact.component').then(m => m.ContactPage)
  },
  {
    path: 'admin/login',
    title: 'Admin Login | Navrik',
    loadComponent: () => import('./_pages/admin/admin-login/admin-login.component').then(m => m.AdminLoginComponent)
  },
  {
    path: 'admin',
    canActivate: [adminAuthGuard],
    loadComponent: () => import('./_pages/admin/admin-shell.component').then(m => m.AdminShellComponent),
    children: [
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
      {
        path: 'overview',
        title: 'Business Overview | Navrik Admin',
        loadComponent: () => import('./_pages/admin/admin-control-centre/admin-control-centre.component').then(m => m.AdminControlCentreComponent)
      },
      { path: 'dashboard', redirectTo: 'overview', pathMatch: 'full' },
      {
        path: 'search-visibility',
        title: 'Search Visibility | Navrik Admin',
        loadComponent: () => import('./_pages/admin/admin-search-console/admin-search-console.component').then(m => m.AdminSearchConsoleComponent)
      },
      {
        path: 'reports',
        title: 'Internal Reports | Navrik Admin',
        loadComponent: () => import('./_pages/admin/admin-reporting/admin-reporting.component').then(m => m.AdminReportingComponent)
      },
      {
        path: 'orders',
        title: 'Orders | Navrik Admin',
        loadComponent: () => import('./_pages/admin/admin-dashboard/admin-dashboard.component').then(m => m.AdminDashboardComponent)
      },
      {
        path: 'warranties',
        title: 'Warranty registrations | Navrik Admin',
        loadComponent: () => import('./_pages/admin/admin-warranties/admin-warranties.component').then(m => m.AdminWarrantiesComponent)
      },
      {
        path: 'products',
        title: 'Products | Navrik Admin',
        loadComponent: () => import('./_pages/admin/admin-products/admin-products.component').then(m => m.AdminProductsComponent)
      },
      {
        path: 'accessories',
        title: 'Accessories | Navrik Admin',
        loadComponent: () => import('./_pages/admin/admin-accessories/admin-accessories.component').then(m => m.AdminAccessoriesComponent)
      },
      {
        path: 'compatibility',
        title: 'Compatibility | Navrik Admin',
        loadComponent: () => import('./_pages/admin/admin-compatibility/admin-compatibility.component').then(m => m.AdminCompatibilityComponent)
      },
      {
        path: 'categories',
        title: 'Categories | Navrik Admin',
        loadComponent: () => import('./_pages/admin/admin-categories/admin-categories.component').then(m => m.AdminCategoriesComponent)
      },
      {
        path: 'analytics',
        title: 'Analytics | Navrik Admin',
        loadComponent: () => import('./_pages/admin/admin-analytics/admin-analytics.component').then(m => m.AdminAnalyticsComponent)
      },
      {
        path: 'coupons',
        title: 'Coupons | Navrik Admin',
        loadComponent: () => import('./_pages/admin/admin-coupons/admin-coupons.component').then(m => m.AdminCouponsComponent)
      },
      {
        path: 'queries',
        title: 'Queries | Navrik Admin',
        loadComponent: () => import('./_pages/admin/admin-queries/admin-queries.component').then(m => m.AdminQueriesComponent)
      },
      {
        path: 'settings',
        title: 'Site Settings | Navrik Admin',
        loadComponent: () => import('./_pages/admin/admin-site-settings/admin-site-settings.component').then(m => m.AdminSiteSettingsComponent)
      },
      {
        path: 'finance-content',
        title: 'Finance Page | Navrik Admin',
        loadComponent: () => import('./_pages/admin/admin-finance-content/admin-finance-content.component').then(m => m.AdminFinanceContentComponent)
      },
      {
        path: 'legal-pages',
        title: 'Legal Pages | Navrik Admin',
        loadComponent: () => import('./_pages/admin/admin-legal-pages/admin-legal-pages.component').then(m => m.AdminLegalPagesComponent)
      },
    ]
  },
  { path: '**', redirectTo: '' }
];
