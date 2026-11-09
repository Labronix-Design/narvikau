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

  it('keeps the chosen status selected while its save is in progress', async () => {
    const row = lead(1, '');
    service.getQueries.and.resolveTo({ rows: [row], totals: {} });
    let resolveUpdate!: (value: unknown) => void;
    service.updateQuery.and.returnValue(new Promise(resolve => { resolveUpdate = resolve; }) as never);
    await component.load();

    const save = component.updateStatus(component.rows()[0], 'ready_to_quote');

    expect(component.statusValue(component.rows()[0])).toBe('ready_to_quote');
    resolveUpdate({ id: row.id, status: 'ready_to_quote', admin_notes: '', follow_up_date: null, follow_up_note: null });
    await save;
    expect(component.statusValue(component.rows()[0])).toBe('ready_to_quote');
  });

  it('restores the saved selection when a status update fails', async () => {
    const row = lead(1, '');
    service.updateQuery.and.rejectWith(new Error('Save failed'));
    TestBed.inject(ModalService).alert = jasmine.createSpy('alert').and.resolveTo();

    await component.updateStatus(row, 'ready_to_quote');

    expect(component.statusValue(row)).toBe('new');
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

    expect((fixture.nativeElement.querySelector('tbody .status-select') as HTMLSelectElement).value)
      .toBe('ready_to_quote');
  });

  it('uses configurable sortable columns and keeps the status select in each row', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const table = fixture.nativeElement.querySelector('website-admin-data-table');
    expect(table).not.toBeNull();
    expect(table.querySelector('th[data-column="customer"]')).not.toBeNull();
    expect(table.querySelector('[data-column="status"] .status-select')).not.toBeNull();
    expect(table.querySelector('button.adt-sort')).not.toBeNull();
    expect(table.querySelector('details.adt-chooser')).not.toBeNull();
  });

  it('sorts enquiries by customer when its table header is selected', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    const first = fixture.componentInstance.rows()[0];
    fixture.componentInstance.rows.set([first, { ...first, id: 2, name: 'Aaron', email: 'aaron@example.test' }]);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('th[data-column="customer"] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const names = [...fixture.nativeElement.querySelectorAll('tbody tr.adt-data-row th[data-column="customer"]')]
      .map((cell: Element) => cell.textContent?.trim());
    expect(names[0]).toContain('Aaron');
    expect(names[1]).toContain('Alex');
  });

  it('shows the pending status in the row select until the server responds', async () => {
    let resolveUpdate!: (value: unknown) => void;
    service.updateQuery.and.returnValue(new Promise(resolve => { resolveUpdate = resolve; }) as never);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const save = component.updateStatus(component.rows()[0], 'ready_to_quote');
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('tbody .status-select') as HTMLSelectElement).value).toBe('ready_to_quote');
    resolveUpdate({ id: 1, status: 'ready_to_quote', admin_notes: null });
    await save;
  });

  it('opens and cancels manual entry in a dialog', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('button.adm-btn.primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"] form.manual-form')).not.toBeNull();
    (fixture.nativeElement.querySelector('[role="dialog"] button[type="button"].adm-btn.ghost') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });

  it('submits a valid manual enquiry through the dialog form and closes it', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    (fixture.nativeElement.querySelector('button.adm-btn.primary') as HTMLButtonElement).click();
    fixture.componentInstance.manualForm.patchValue({
      name: 'Jordan Test', email: 'jordan@example.test',
      Location: { state: 'Victoria', suburb: 'Richmond' },
      DiscoverySource: 'Google Search',
    });
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('[role="dialog"] button[type="submit"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(service.createQuery).toHaveBeenCalledWith(jasmine.objectContaining({
      name: 'Jordan Test', email: 'jordan@example.test',
      location_state: 'Victoria', location_suburb: 'Richmond', discovery_source: 'Google Search',
    }));
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain('Manual enquiry created');
  });

  it('opens details and notes in a dialog from the row action', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('[aria-label="Details for Alex"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"] .expand-message')?.textContent)
      .toContain('Could you quote a canopy for my Ranger?');
    expect(fixture.nativeElement.querySelector('[role="dialog"] .notes-input')).not.toBeNull();
  });

  it('keeps a saved follow-up status when its optional dialog is cancelled', async () => {
    service.updateQuery.and.resolveTo({ id: 1, status: 'follow_up_later', admin_notes: null, follow_up_date: null, follow_up_note: null });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const component = fixture.componentInstance;
    await component.updateStatus(component.rows()[0], 'follow_up_later');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"] #follow-up-date')).not.toBeNull();
    (fixture.nativeElement.querySelector('[role="dialog"] button.adm-btn.ghost') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.rows()[0].status).toBe('follow_up_later');
    expect(component.followUpId()).toBeNull();
  });

  it('submits follow-up details through the dialog and closes after the update', async () => {
    service.updateQuery.and.returnValues(
      Promise.resolve({ id: 1, status: 'follow_up_later', admin_notes: null, follow_up_date: null, follow_up_note: null }),
      Promise.resolve({ id: 1, status: 'follow_up_later', admin_notes: null, follow_up_date: '2026-11-20', follow_up_note: 'Call after quote' }),
    );
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const select = fixture.nativeElement.querySelector('[aria-label="Status for Alex"]') as HTMLSelectElement;
    select.value = 'follow_up_later';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"] #follow-up-date')).not.toBeNull();
    fixture.componentInstance.followUpForm.patchValue({ follow_up_date: '2026-11-20', follow_up_note: 'Call after quote' });
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('[role="dialog"] button[type="submit"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(service.updateQuery.calls.count()).toBe(2);
    expect(service.updateQuery.calls.mostRecent().args).toEqual([1, {
      status: 'follow_up_later', follow_up_date: '2026-11-20', follow_up_note: 'Call after quote',
    }]);
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    expect(fixture.componentInstance.followUpId()).toBeNull();
    expect(fixture.componentInstance.rows()[0].follow_up_date).toBe('2026-11-20');
    expect(fixture.componentInstance.rows()[0].follow_up_note).toBe('Call after quote');
  });

  it('saves edited notes through the detail dialog', async () => {
    service.updateQuery.and.resolveTo({ id: 1, status: 'new', admin_notes: 'Call again' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('[aria-label="Details for Alex"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const notes = fixture.nativeElement.querySelector('[role="dialog"] .notes-input') as HTMLTextAreaElement;
    notes.value = 'Call again';
    notes.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('[role="dialog"] .expand-section button') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(service.updateQuery).toHaveBeenCalledWith(1, { admin_notes: 'Call again' });
    expect(fixture.componentInstance.rows()[0].admin_notes).toBe('Call again');
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
