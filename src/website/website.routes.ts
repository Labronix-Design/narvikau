import { Routes } from '@angular/router';
import { adminAuthGuard } from './_guards/admin-auth.guard';

export const websiteRoutes: Routes = [
  {
    path: '',
    title: 'Navrik Australia | Aluminium Canopies',
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
    title: 'Canopies | Navrik Australia',
    loadComponent: () => import('./_pages/products/products.component').then(m => m.ProductsPage)
  },
  {
    path: 'accessories',
    redirectTo: 'products',
    pathMatch: 'full',
  },
  {
    path: 'products/:slug',
    title: 'Canopy | Navrik Australia',
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
    redirectTo: 'products',
    pathMatch: 'full',
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
        path: 'analytics',
        title: 'Analytics | Navrik Admin',
        loadComponent: () => import('./_pages/admin/admin-analytics/admin-analytics.component').then(m => m.AdminAnalyticsComponent)
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
        path: 'legal-pages',
        title: 'Legal Pages | Navrik Admin',
        loadComponent: () => import('./_pages/admin/admin-legal-pages/admin-legal-pages.component').then(m => m.AdminLegalPagesComponent)
      },
    ]
  },
  { path: '**', redirectTo: '' }
];
