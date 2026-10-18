import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminQueriesComponent } from './admin-queries.component';
import { AdminQueryRow, AdminService } from '../../../_services/admin.service';
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

describe('Admin enquiry note drafts', () => {
  const lead = (id: number, admin_notes: string): AdminQueryRow => ({
    id, source: 'website', name: `Lead ${id}`, email: `lead${id}@example.test`,
    phone: null, company: null, product: null, message: null, status: 'new',
    admin_notes, enquiry_type: 'general_contact', location_state: null,
    location_suburb: null, discovery_source: null, discovery_source_detail: null,
    created_at: '2026-10-14T00:00:00.000Z',
  });
  let component: AdminQueriesComponent;
  let service: jasmine.SpyObj<AdminService>;

  beforeEach(() => {
    service = jasmine.createSpyObj('AdminService', ['getQueries', 'createQuery', 'updateQuery']);
    service.updateQuery.and.resolveTo({} as never);
    service.createQuery.and.resolveTo({ id: 3 } as never);
    TestBed.configureTestingModule({ providers: [{ provide: AdminService, useValue: service }, { provide: ModalService, useValue: {} }] });
    component = TestBed.runInInjectionContext(() => new AdminQueriesComponent());
  });

  it('keeps an unsaved note when updating another lead status refreshes the list', async () => {
    const first = lead(1, 'Server note');
    const second = lead(2, 'Other note');
    service.getQueries.and.resolveTo({ rows: [first, second], totals: {} });
    await component.load();
    component.setNote(first.id, 'Draft note');

    await component.updateStatus(second, 'contacted');

    expect(component.notesMap()[first.id]).toBe('Draft note');
    expect(component.notesMap()[second.id]).toBe('Other note');
  });

  it('keeps a draft through a manual creation refresh and a filter that hides the lead', async () => {
    const first = lead(1, 'Server note');
    service.getQueries.and.resolveTo({ rows: [first], totals: {} });
    await component.load();
    component.setNote(first.id, 'Draft note');
    service.getQueries.and.resolveTo({ rows: [lead(3, '')], totals: {} });
    component.manualForm.patchValue({
      name: 'Alex', email: 'alex@example.test', Location: { state: 'Victoria', suburb: 'Richmond' },
      DiscoverySource: 'Google Search',
    });

    await component.saveManual();
    expect(component.notesMap()[first.id]).toBe('Draft note');

    service.getQueries.and.resolveTo({ rows: [lead(1, 'Server note')], totals: {} });
    await component.load();
    expect(component.notesMap()[first.id]).toBe('Draft note');
  });

  it('uses refreshed server notes after a draft is saved', async () => {
    const first = lead(1, 'Server note');
    service.getQueries.and.resolveTo({ rows: [first], totals: {} });
    await component.load();
    component.setNote(first.id, 'Saved note');

    await component.saveNotes(first);
    service.getQueries.and.resolveTo({ rows: [lead(1, 'Updated elsewhere')], totals: {} });
    await component.load();

    expect(component.notesMap()[first.id]).toBe('Updated elsewhere');
  });

  it('keeps edits made while an earlier note save is in flight', async () => {
    const first = lead(1, 'Server note');
    service.getQueries.and.resolveTo({ rows: [first], totals: {} });
    await component.load();
    component.setNote(first.id, 'First draft');
    let finishSave!: () => void;
    service.updateQuery.and.returnValue(new Promise<void>(resolve => { finishSave = resolve; }));

    const saving = component.saveNotes(first);
    component.setNote(first.id, 'Second draft');
    finishSave();
    await saving;
    await component.load();

    expect(component.notesMap()[first.id]).toBe('Second draft');
  });
});

describe('Admin enquiries list', () => {
  let fixture: ComponentFixture<AdminQueriesComponent>;
  let service: jasmine.SpyObj<AdminService>;

  beforeEach(async () => {
    service = jasmine.createSpyObj('AdminService', ['getQueries', 'createQuery', 'updateQuery']);
    service.getQueries.and.resolveTo({
      rows: [{
        id: 1, source: 'website', name: 'Alex', email: 'alex@example.test', phone: null,
        company: null, product: null, message: 'Could you quote a canopy for my Ranger?',
        status: 'new', admin_notes: null, enquiry_type: 'product_quote', location_state: null,
        location_suburb: null, discovery_source: null, discovery_source_detail: null,
        created_at: '2026-10-14T00:00:00.000Z',
      }],
      totals: {},
    });
    await TestBed.configureTestingModule({
      imports: [AdminQueriesComponent],
      providers: [{ provide: AdminService, useValue: service }, { provide: ModalService, useValue: {} }],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminQueriesComponent);
  });

  it('shows each enquiry message in the list without requiring the details control', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.message-preview')?.textContent)
      .toContain('Could you quote a canopy for my Ranger?');
  });
});
