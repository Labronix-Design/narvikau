import { TestBed } from '@angular/core/testing';
import { AdminQueriesComponent } from './admin-queries.component';
import { AdminService } from '../../../_services/admin.service';
import { ModalService } from '../../../_services/modal.service';

describe('Admin enquiry capture', () => {
  const base = { name: 'Alex', email: 'alex@example.test', Location: { state: 'Victoria', suburb: ' Richmond ' }, DiscoverySource: 'Google Search' };
  let component: AdminQueriesComponent;
  let service: jasmine.SpyObj<AdminService>;
  beforeEach(() => {
    service = jasmine.createSpyObj('AdminService', ['getQueries', 'createQuery', 'updateQuery']);
    service.getQueries.and.resolveTo({ rows: [], totals: {} });
    service.createQuery.and.resolveTo({ id: 1 } as never);
    TestBed.configureTestingModule({ providers: [{ provide: AdminService, useValue: service }, { provide: ModalService, useValue: {} }] });
    component = TestBed.runInInjectionContext(() => new AdminQueriesComponent());
  });
  it('requires company for partner leads and product for product quotes', async () => {
    component.manualForm.patchValue({ ...base, enquiry_type: 'dealer_enquiry' });
    await component.saveManual();
    expect(service.createQuery).not.toHaveBeenCalled();
    component.manualForm.patchValue({ enquiry_type: 'product_quote' });
    await component.saveManual();
    expect(service.createQuery).not.toHaveBeenCalled();
  });
  it('creates a manual lead with the strict snake_case contract and refreshes filters', async () => {
    component.manualForm.patchValue({ ...base, enquiry_type: 'dealer_enquiry', company: 'Alex Motors' });
    component.activeTab.set('new');
    component.activeType.set('dealer_enquiry');
    await component.saveManual();
    expect(service.createQuery).toHaveBeenCalledWith(jasmine.objectContaining({ company: 'Alex Motors', enquiry_type: 'dealer_enquiry', location_state: 'Victoria', location_suburb: 'Richmond', discovery_source: 'Google Search' }));
    const payload = service.createQuery.calls.mostRecent().args[0];
    expect('Location' in payload).toBeFalse();
    expect('source' in payload).toBeFalse();
    expect(service.getQueries).toHaveBeenCalledWith({ status: 'new', enquiry_type: 'dealer_enquiry' });
  });
});
