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
  it('includes follow-up details when creating a follow-up enquiry', async () => {
    component.manualForm.patchValue({ ...base, status: 'follow_up_later' });
    component.manualForm.patchValue({ follow_up_date: '2026-11-01', follow_up_note: 'Call customer' });
    await component.saveManual();
    expect(service.createQuery).toHaveBeenCalledWith(jasmine.objectContaining({ status: 'follow_up_later', follow_up_date: '2026-11-01', follow_up_note: 'Call customer' }));
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

  it('saves Follow up later before opening optional details and keeps it saved when the editor closes', async () => {
    const row = lead(1, '');
    service.getQueries.and.resolveTo({ rows: [row], totals: {} });
    service.updateQuery.and.resolveTo({ id: row.id, status: 'follow_up_later', admin_notes: '', follow_up_date: null, follow_up_note: null } as never);
    await component.load();

    await component.updateStatus(component.rows()[0], 'follow_up_later');

    expect(service.updateQuery).toHaveBeenCalledWith(row.id, { status: 'follow_up_later' });
    expect(component.rows()[0].status).toBe('follow_up_later');
    expect(component.followUpId()).toBe(row.id);

    component.followUpId.set(null);
    expect(component.rows()[0].status).toBe('follow_up_later');
  });

  it('shows a saved result after a normal status update', async () => {
    const row = lead(1, '');
    service.getQueries.and.resolveTo({ rows: [row], totals: {} });
    service.updateQuery.and.resolveTo({ id: row.id, status: 'ready_to_quote', admin_notes: '', follow_up_date: null, follow_up_note: null } as never);
    await component.load();

    await component.updateStatus(component.rows()[0], 'ready_to_quote');

    expect(component.rows()[0].status).toBe('ready_to_quote');
    expect(component.notice()).toContain('Ready to quote');
  });

  it('restores the saved selection when a status update fails', async () => {
    const row = lead(1, '');
    const select = document.createElement('select');
    for (const status of ['new', 'ready_to_quote']) select.add(new Option(status, status));
    select.value = 'ready_to_quote';
    service.updateQuery.and.rejectWith(new Error('Save failed'));
    TestBed.inject(ModalService).alert = jasmine.createSpy('alert').and.resolveTo();

    await component.updateStatus(row, 'ready_to_quote', select);

    expect(select.value).toBe('new');
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

  it('shows the server status in a row dropdown after its dynamic options render', async () => {
    service.getQueries.and.resolveTo({
      rows: [{
        id: 1, source: 'website', name: 'Alex', email: 'alex@example.test', phone: null,
        company: null, product: null, message: null, status: 'ready_to_quote', admin_notes: null,
        enquiry_type: 'product_quote', location_state: null, location_suburb: null,
        discovery_source: null, discovery_source_detail: null, created_at: '2026-10-14T00:00:00.000Z',
      }],
      totals: {},
    });

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement.querySelector('.status-select') as HTMLSelectElement).value)
      .toBe('ready_to_quote');
  });
});
