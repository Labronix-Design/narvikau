import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface ProductVariant {
  id?: number;
  product_id: number;
  variant_type: string;
  variant_value: string;
  label: string;
  price_delta: number;
  is_active: boolean;
  sort_order: number;
}

export interface CatalogProduct {
  id?: number;
  slug: string;
  name: string;
  category: string;
  tray_type: 'standard' | 'premium' | null;
  size: string | null;
  color: string;
  base_price: number;
  coating_cost: number;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
  gallery_urls: string[];
  material: string | null;
  thickness: string | null;
  front_door_window: string | null;
  side_door: string | null;
  rear_door: string | null;
  vehicle_fit: string | null;
}

export interface CatalogAccessory {
  id?: number;
  slug: string;
  name: string;
  category: string;
  price: number;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
}


export interface CompatibilityRule {
  id?: number;
  accessory_id: number;
  accessory_name?: string;
  accessory_category?: string;
  tray_type: 'standard' | 'premium' | null;
  product_id: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  notes: string | null;
}

export interface OrderSummary {
  total: string;
  pending: string;
  deposit_paid: string;
  in_production: string;
  completed: string;
  promo_orders: string;
  total_value: string;
  completed_value: string;
}

export interface WarrantyRegistrationRecord {
  id: number;
  registration_reference: string;
  order_id: number | null;
  purchaser_name: string;
  purchaser_email: string;
  purchaser_phone: string;
  product_name: string;
  order_reference: string | null;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_year: number;
  vehicle_registration: string;
  purchase_date: string;
  fitment_date: string;
  consent_at: string;
  registered_at: string;
}

export interface CatalogCategory {
  id?: number;
  slug: string;
  name: string;
  type: 'product' | 'accessory';
  eyebrow: string | null;
  icon: string | null;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface PromoCoupon {
  id: number;
  code: string;
  description: string | null;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  min_order_zar: number | null;
  max_uses: number | null;
  current_uses: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

export interface CacheMetadata {
  status?: 'fresh' | 'stale' | 'unavailable' | string;
  updatedAt?: string | null;
}

export interface ControlMetricData {
  label: string;
  value: number | string | null;
  format?: 'number' | 'currency' | 'percent' | 'text';
  context?: string;
  trend?: string;
  unavailableReason?: string;
  tone?: 'default' | 'accent' | 'success' | 'warning';
}

export interface BusinessProfile {
  companyName: string;
  tradingName: string;
  domains?: string[];
  serviceInformation: string;
  contacts: { email: string; phone: string; address: string };
  preferences: { reportingTimezone: 'Africa/Johannesburg' };
}

export interface ControlCentreSection {
  status?: 'ready' | 'setup' | 'unavailable' | string;
  explanation?: string;
  metrics?: ControlMetricData[];
  activity?: Array<{ title: string; detail?: string; occurredAt?: string; tone?: string }>;
  actions?: Array<{ title: string; detail: string; route?: string; priority?: 'high' | 'normal' }>;
  [key: string]: unknown;
}

export type ControlCentreCacheSectionStatus = 'ready' | 'stale' | 'not_measured' | string;

export type BusinessSnapshotStatus = 'ready' | 'not_measured';
export type BusinessSnapshotHealthState = 'ready' | 'attention' | 'action-required' | 'not-measured';

export interface BusinessSnapshotHealth {
  state: BusinessSnapshotHealthState;
  label: string;
  explanation: string;
}

export interface BusinessSnapshotComparison {
  status: 'not_measured' | 'ready';
  explanation: string;
}

export interface NotMeasuredBusinessSnapshot {
  status: 'not_measured';
  explanation: string;
}

export interface BusinessOverviewSnapshot {
  status: 'ready';
  scope: { orders: string; revenue: string; enquiries: string };
  revenueCents: number;
  paidOrderCount: number;
  orderCount: number;
  ordersInProduction: number;
  enquiryCount: number;
  newEnquiries: number;
  conversion: { numerator: number; denominator: number };
  comparison: BusinessSnapshotComparison;
  actions: Array<{ key: string; explanation: string }>;
  health: BusinessSnapshotHealth;
}

export interface SalesPerformanceSnapshot {
  status: 'ready';
  scope: { revenue: string; orders: string };
  revenueCents: number;
  paidOrderCount: number;
  averagePaidOrderValueCents: number;
  comparison: BusinessSnapshotComparison;
  health: BusinessSnapshotHealth;
}

export interface OrdersSnapshot {
  status: 'ready';
  scope: { orders: string };
  orderCount: number;
  pendingOrderCount: number;
  depositPaidOrderCount: number;
  ordersInProduction: number;
  readyOrderCount: number;
  completedOrderCount: number;
  comparison: BusinessSnapshotComparison;
  health: BusinessSnapshotHealth;
}

export interface EnquiriesSnapshot {
  status: 'ready';
  scope: { enquiries: string };
  enquiryCount: number;
  newEnquiries: number;
  contactedEnquiries: number;
  quotedEnquiries: number;
  convertedEnquiries: number;
  closedEnquiries: number;
  conversion: { numerator: number; denominator: number };
  comparison: BusinessSnapshotComparison;
  health: BusinessSnapshotHealth;
}

export type BusinessOverviewReadModel = BusinessOverviewSnapshot | NotMeasuredBusinessSnapshot;
export type SalesPerformanceReadModel = SalesPerformanceSnapshot | NotMeasuredBusinessSnapshot;
export type OrdersReadModel = OrdersSnapshot | NotMeasuredBusinessSnapshot;
export type EnquiriesReadModel = EnquiriesSnapshot | NotMeasuredBusinessSnapshot;
export type ControlCentreRefreshSection = 'business_overview' | 'sales_performance' | 'orders' | 'enquiries' | 'search';

export interface ControlCentreResponse {
  data: {
    business_overview: BusinessOverviewReadModel;
    sales_performance: SalesPerformanceReadModel;
    orders: OrdersReadModel;
    enquiries: EnquiriesReadModel;
    search: ControlCentreSection;
  };
  cache?: CacheMetadata;
  profile?: BusinessProfile;
  sections?: Record<string, ControlCentreCacheSectionStatus>;
}

export interface ControlCentreRefreshResponse {
  section?: ControlCentreRefreshSection;
  data?: BusinessOverviewSnapshot | SalesPerformanceSnapshot | OrdersSnapshot | EnquiriesSnapshot;
  cache?: CacheMetadata;
  invalidatedSections?: string[];
}

export interface SalesPerformanceResponse {
  status: BusinessSnapshotStatus;
  explanation?: string;
  data: SalesPerformanceSnapshot | null;
  cache?: CacheMetadata;
}

export interface SearchConsoleResponse {
  status: 'ready' | 'setup' | 'unavailable' | string;
  explanation?: string;
  missingConfiguration?: string[];
  data?: {
    metrics?: ControlMetricData[];
    topQueries?: Array<{ query: string; clicks?: number; impressions?: number; ctr?: number; position?: number; averagePosition?: number }>;
    topPages?: Array<{ page: string; clicks?: number; impressions?: number; ctr?: number; position?: number; averagePosition?: number }>;
    opportunities?: Array<{ title: string; detail: string }>;
    comparison?: { clicks?: number; impressions?: number; ctr?: number; averagePosition?: number } | string | null;
    websiteAnalytics?: {
      status?: 'ready' | 'setup_required' | 'not_measured' | string;
      explanation?: string;
      period?: { startDate: string; endDate: string };
      metrics?: { activeUsers?: number; sessions?: number; pageViews?: number; keyEvents?: number } | null;
      comparison?: { activeUsers?: number; sessions?: number; pageViews?: number; keyEvents?: number } | null;
    };
  };
  cache?: CacheMetadata;
  integration?: { property?: string; status?: string };
}

export interface InternalReportResponse {
  reports: Array<{ id?: number; reportDate?: string; createdAt?: string; title?: string; summary?: string; measurementCoverage?: string; invoiceReadiness?: string; reminder?: boolean }>;
  cache?: CacheMetadata;
}

export interface MonthlyBusinessReportPeriod {
  startDate: string;
  endDate: string;
  label: string;
  complete: boolean;
}

export interface MonthlyBusinessReportContent {
  orders: Record<string, unknown>;
  leads: Record<string, unknown>;
  search: Record<string, unknown>;
  hosting: Record<string, unknown>;
  invoiceReadiness: Record<string, unknown>;
  measurementCoverage: Record<string, unknown>;
}

export interface MonthlyBusinessReportResponse {
  reportType: 'monthly_business' | string;
  period: MonthlyBusinessReportPeriod;
  report: MonthlyBusinessReportContent;
  delivery: {
    status?: 'ready' | 'setup_required' | 'not_configured' | string;
    sentAt?: string | null;
    recipientConfigured: boolean;
  };
}

export interface MonthlyBusinessReportSendResponse {
  status: 'sent' | 'already_sent';
  period: MonthlyBusinessReportPeriod;
  delivery: { recipient: string; sentAt: string | null };
  report: MonthlyBusinessReportContent;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);

  private get authHeaders(): HttpHeaders {
    const token = sessionStorage.getItem('navrik_admin_token') || '';
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  async login(password: string): Promise<string> {
    const res: any = await firstValueFrom(
      this.http.post('/api/admin-auth', { password })
    );
    return res.token;
  }

  logout(): void {
    sessionStorage.removeItem('navrik_admin_token');
  }

  // ── Image upload (Netlify Blobs) ─────────────────────────────
  async uploadImage(file: File): Promise<{ url: string }> {
    const dataBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    return firstValueFrom(
      this.http.post<{ url: string }>('/api/admin-upload', {
        filename: file.name,
        contentType: file.type,
        dataBase64,
      }, { headers: this.authHeaders })
    );
  }

  // ── Products ────────────────────────────────────────────────
  getProducts(): Promise<CatalogProduct[]> {
    return firstValueFrom(this.http.get<CatalogProduct[]>('/api/admin-products', { headers: this.authHeaders }));
  }

  createProduct(p: CatalogProduct): Promise<CatalogProduct> {
    return firstValueFrom(this.http.post<CatalogProduct>('/api/admin-products', p, { headers: this.authHeaders }));
  }

  updateProduct(p: CatalogProduct): Promise<CatalogProduct> {
    return firstValueFrom(this.http.put<CatalogProduct>('/api/admin-products', p, { headers: this.authHeaders }));
  }

  deleteProduct(id: number): Promise<any> {
    return firstValueFrom(this.http.delete('/api/admin-products', { headers: this.authHeaders, body: { id } }));
  }

  // ── Product Variants ─────────────────────────────────────────
  getVariants(productId: number): Promise<ProductVariant[]> {
    return firstValueFrom(this.http.get<ProductVariant[]>(`/api/admin-products?variants=1&product_id=${productId}`, { headers: this.authHeaders }));
  }

  saveVariant(v: Partial<ProductVariant> & { product_id: number }): Promise<ProductVariant> {
    return firstValueFrom(this.http.put<ProductVariant>('/api/admin-products', { variant: true, ...v }, { headers: this.authHeaders }));
  }

  deleteVariant(id: number): Promise<any> {
    return firstValueFrom(this.http.delete('/api/admin-products', { headers: this.authHeaders, body: { variant: true, id } }));
  }

  // ── Accessories ─────────────────────────────────────────────
  getAccessories(): Promise<CatalogAccessory[]> {
    return firstValueFrom(this.http.get<CatalogAccessory[]>('/api/admin-accessories', { headers: this.authHeaders }));
  }

  createAccessory(a: CatalogAccessory): Promise<CatalogAccessory> {
    return firstValueFrom(this.http.post<CatalogAccessory>('/api/admin-accessories', a, { headers: this.authHeaders }));
  }

  updateAccessory(a: CatalogAccessory): Promise<CatalogAccessory> {
    return firstValueFrom(this.http.put<CatalogAccessory>('/api/admin-accessories', a, { headers: this.authHeaders }));
  }

  deleteAccessory(id: number): Promise<any> {
    return firstValueFrom(this.http.delete('/api/admin-accessories', { headers: this.authHeaders, body: { id } }));
  }

  // ── Compatibility ────────────────────────────────────────────
  getCompatibility(): Promise<CompatibilityRule[]> {
    return firstValueFrom(this.http.get<CompatibilityRule[]>('/api/admin-compatibility', { headers: this.authHeaders }));
  }

  addCompatibilityRule(rule: Omit<CompatibilityRule, 'id'>): Promise<CompatibilityRule> {
    return firstValueFrom(this.http.post<CompatibilityRule>('/api/admin-compatibility', rule, { headers: this.authHeaders }));
  }

  deleteCompatibilityRule(id: number): Promise<any> {
    return firstValueFrom(this.http.delete('/api/admin-compatibility', { headers: this.authHeaders, body: { id } }));
  }

  // ── Orders ──────────────────────────────────────────────────
  getOrderSummary(): Promise<OrderSummary> {
    return firstValueFrom(this.http.get<OrderSummary>('/api/admin-orders?summary=1', { headers: this.authHeaders }));
  }

  getOrders(params?: { limit?: number; offset?: number; status?: string }): Promise<any[]> {
    const qs = new URLSearchParams();
    if (params?.limit)  qs.set('limit',  String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    if (params?.status) qs.set('status', params.status);
    return firstValueFrom(this.http.get<any[]>(`/api/admin-orders?${qs}`, { headers: this.authHeaders }));
  }

  updateOrderStatus(id: number, status: string, notes?: string): Promise<any> {
    return firstValueFrom(this.http.put('/api/admin-orders', { id, status, notes }, { headers: this.authHeaders }));
  }

  getWarrantyRegistrations(params?: { limit?: number; offset?: number }): Promise<{ items: WarrantyRegistrationRecord[] }> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    return firstValueFrom(this.http.get<{ items: WarrantyRegistrationRecord[] }>(`/api/admin-warranties?${qs}`, { headers: this.authHeaders }));
  }

  // ── Sales performance (cached server snapshot) ──────────────
  getSalesPerformance(): Promise<SalesPerformanceResponse> {
    return firstValueFrom(this.http.get<SalesPerformanceResponse>('/api/admin-analytics?type=sales_performance', { headers: this.authHeaders }));
  }

  // ── Business control centre (server-side cached read models) ──
  getControlCentre(): Promise<ControlCentreResponse> {
    return firstValueFrom(this.http.get<ControlCentreResponse>('/api/admin-control-centre', { headers: this.authHeaders }));
  }

  refreshControlCentre(section: ControlCentreRefreshSection): Promise<ControlCentreRefreshResponse> {
    return firstValueFrom(this.http.post<ControlCentreRefreshResponse>('/api/admin-control-centre', { section }, { headers: this.authHeaders }));
  }

  updateBusinessProfile(profile: BusinessProfile): Promise<ControlCentreResponse> {
    return firstValueFrom(this.http.put<ControlCentreResponse>('/api/admin-control-centre', { profile }, { headers: this.authHeaders }));
  }

  getSearchConsole(): Promise<SearchConsoleResponse> {
    return firstValueFrom(this.http.get<SearchConsoleResponse>('/api/admin-search-console', { headers: this.authHeaders }));
  }

  getSearchConsoleConnectionUrl(): Promise<{ authorizationUrl: string }> {
    return firstValueFrom(this.http.get<{ authorizationUrl: string }>('/api/admin-search-console?action=connect', { headers: this.authHeaders }));
  }

  refreshSearchConsole(): Promise<SearchConsoleResponse> {
    return firstValueFrom(this.http.post<SearchConsoleResponse>('/api/admin-search-console', { action: 'refresh' }, { headers: this.authHeaders }));
  }

  getInternalReports(): Promise<InternalReportResponse> {
    return firstValueFrom(this.http.get<InternalReportResponse>('/api/internal-report', { headers: this.authHeaders }));
  }

  getMonthlyBusinessReport(): Promise<MonthlyBusinessReportResponse> {
    return firstValueFrom(this.http.get<MonthlyBusinessReportResponse>('/api/monthly-business-report', { headers: this.authHeaders }));
  }

  sendMonthlyBusinessReport(): Promise<MonthlyBusinessReportSendResponse> {
    return firstValueFrom(this.http.post<MonthlyBusinessReportSendResponse>('/api/monthly-business-report', { action: 'send_current' }, { headers: this.authHeaders }));
  }

  // ── Coupons ─────────────────────────────────────────────────
  getCoupons(): Promise<PromoCoupon[]> {
    return firstValueFrom(this.http.get<PromoCoupon[]>('/api/admin-coupons', { headers: this.authHeaders }));
  }

  createCoupon(payload: Omit<PromoCoupon, 'id' | 'current_uses' | 'created_at'>): Promise<PromoCoupon> {
    return firstValueFrom(this.http.post<PromoCoupon>('/api/admin-coupons', payload, { headers: this.authHeaders }));
  }

  updateCoupon(payload: { id: number } & Partial<PromoCoupon>): Promise<PromoCoupon> {
    return firstValueFrom(this.http.put<PromoCoupon>('/api/admin-coupons', payload, { headers: this.authHeaders }));
  }

  deleteCoupon(id: number): Promise<any> {
    return firstValueFrom(this.http.delete('/api/admin-coupons', { headers: this.authHeaders, body: { id } }));
  }

  // ── Categories ──────────────────────────────────────────────
  getCategories(): Promise<CatalogCategory[]> {
    return firstValueFrom(this.http.get<CatalogCategory[]>('/api/admin-categories', { headers: this.authHeaders }));
  }

  createCategory(cat: CatalogCategory): Promise<CatalogCategory> {
    return firstValueFrom(this.http.post<CatalogCategory>('/api/admin-categories', cat, { headers: this.authHeaders }));
  }

  updateCategory(cat: CatalogCategory): Promise<CatalogCategory> {
    return firstValueFrom(this.http.put<CatalogCategory>('/api/admin-categories', cat, { headers: this.authHeaders }));
  }

  deleteCategory(id: number): Promise<any> {
    return firstValueFrom(this.http.delete('/api/admin-categories', { headers: this.authHeaders, body: { id } }));
  }

  // ── Queries (contact leads) ──────────────────────────────────
  getQueries(params?: { status?: string; limit?: number; offset?: number }): Promise<any> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.limit)  qs.set('limit',  String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    return firstValueFrom(this.http.get<any>(`/api/admin-queries?${qs}`, { headers: this.authHeaders }));
  }

  updateQuery(id: number, payload: { status?: string; admin_notes?: string }): Promise<any> {
    return firstValueFrom(this.http.put<any>('/api/admin-queries', { id, ...payload }, { headers: this.authHeaders }));
  }

  // ── Site Settings ─────────────────────────────────────────────
  getSiteSettings(): Promise<import('../_models/site-settings.models').SiteSettings> {
    return firstValueFrom(this.http.get<any>('/api/admin-site-settings', { headers: this.authHeaders }));
  }

  updateSiteSettings(payload: import('../_models/site-settings.models').SiteSettings): Promise<any> {
    return firstValueFrom(this.http.put<any>('/api/admin-site-settings', payload, { headers: this.authHeaders }));
  }

  // ── Promo Config (launch promo) ─────────────────────────────
  getPromoConfig(): Promise<any> {
    return firstValueFrom(this.http.get<any>('/api/admin-promo-config', { headers: this.authHeaders }));
  }

  updatePromoConfig(payload: {
    is_active: boolean;
    max_promo_slots: number;
    discount_percent: number;
    standard_installation_cost_zar: number;
    deposit_percent: number;
  }): Promise<any> {
    return firstValueFrom(this.http.put<any>('/api/admin-promo-config', payload, { headers: this.authHeaders }));
  }

  // ── Finance Page ─────────────────────────────────────────────
  getFinancePageContent(): Promise<Partial<import('../_models/finance-page.models').FinancePageContent>> {
    return firstValueFrom(this.http.get<any>('/api/admin-finance-page', { headers: this.authHeaders }));
  }

  updateFinancePageContent(payload: import('../_models/finance-page.models').FinancePageContent): Promise<any> {
    return firstValueFrom(this.http.put<any>('/api/admin-finance-page', payload, { headers: this.authHeaders }));
  }

  // ── Legal Pages (Refund Policy, Terms of Service) ────────────
  getLegalPage(page: 'refund' | 'terms'): Promise<Partial<import('../_models/legal-page.models').LegalPageContent>> {
    return firstValueFrom(this.http.get<any>(`/api/admin-legal-pages?page=${page}`, { headers: this.authHeaders }));
  }

  updateLegalPage(page: 'refund' | 'terms', payload: import('../_models/legal-page.models').LegalPageContent): Promise<any> {
    return firstValueFrom(this.http.put<any>(`/api/admin-legal-pages?page=${page}`, payload, { headers: this.authHeaders }));
  }
}
