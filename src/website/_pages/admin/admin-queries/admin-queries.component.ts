import { EnquiryLocationComponent } from '../../../_components/enquiry-location/enquiry-location.component';
import { enquiryControls, enquiryPayload } from '../../../_models/enquiry-location.models';
import { ENQUIRY_SOURCE_OPTIONS, sourceRequiresDetail, sourceDetailRequiredValidator } from '../../../_models/enquiry-source.models';
import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AdminService, AdminQueryRow, AdminQueryTotals, ManualQueryInput } from '../../../_services/admin.service';
import { ModalService } from '../../../_services/modal.service';

@Component({
  selector: 'website-admin-queries',
  templateUrl: './admin-queries.component.html',
  styleUrls: ['./admin-queries.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, DatePipe, ReactiveFormsModule, EnquiryLocationComponent, MatIconModule],
})
export class AdminQueriesComponent implements OnInit {
  private adminService = inject(AdminService);
  private modal = inject(ModalService);
  private readonly fb = inject(FormBuilder).nonNullable;
  private loadSequence = 0;
  private readonly dirtyNoteIds = new Set<number>();
  readonly activeType = signal('');
  readonly showManualForm = signal(false);
  readonly savingManual = signal(false);
  readonly manualSubmitted = signal(false);
  readonly manualError = signal('');
  readonly notice = signal('');
  readonly sourceOptions = ENQUIRY_SOURCE_OPTIONS;
  readonly sourceRequiresDetail = sourceRequiresDetail;
  readonly typeOptions = [
    { value: 'general_contact', label: 'General contact' },
    { value: 'product_quote', label: 'Product quote' },
    { value: 'dealer_enquiry', label: 'Dealer enquiry' },
    { value: 'fitment_enquiry', label: 'Fitment centre enquiry' },
  ];
  readonly manualForm = this.fb.group({
    name: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(160)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    phone: ['', Validators.maxLength(50)],
    company: ['', Validators.maxLength(160)],
    product: ['', Validators.maxLength(160)],
    message: ['', Validators.maxLength(4000)],
    status: ['new', Validators.required],
    admin_notes: ['', Validators.maxLength(4000)],
    follow_up_date: [''],
    follow_up_note: ['', Validators.maxLength(4000)],
    enquiry_type: ['general_contact', Validators.required],
    ...enquiryControls(),
  }, { validators: [sourceDetailRequiredValidator, form => {
    const type = form.get('enquiry_type')?.value;
    if (['dealer_enquiry', 'fitment_enquiry'].includes(type) && !form.get('company')?.value.trim()) return { companyRequired: true };
    if (type === 'product_quote' && !form.get('product')?.value.trim()) return { productRequired: true };
    return null;
  }] });
  readonly followUpForm = this.fb.group({
    follow_up_date: [''],
    follow_up_note: ['', Validators.maxLength(4000)],
  });
  readonly followUpId = signal<number | null>(null);
  readonly savingFollowUp = signal(false);
  readonly followUpError = signal('');

  rows       = signal<AdminQueryRow[]>([]);
  totals     = signal<AdminQueryTotals | null>(null);
  loading    = signal(true);
  error      = signal('');
  activeTab  = signal<string>('');
  expandedId = signal<number | null>(null);
  notesMap   = signal<Partial<Record<number, string>>>({});

  readonly tabs = [
    { value: '',          label: 'All'        },
    { value: 'new', label: 'New enquiry' },
    { value: 'awaiting_customer_information', label: 'Awaiting customer information' },
    { value: 'ready_to_quote', label: 'Ready to quote' },
    { value: 'quote_sent', label: 'Quote sent' },
    { value: 'quote_followed_up', label: 'Quote followed up' },
    { value: 'follow_up_later', label: 'Follow up later' },
    { value: 'converted', label: 'Converted / Order confirmed' },
    { value: 'closed', label: 'Closed / Not proceeding' },
    { value: 'contacted', label: 'Contacted (legacy)' },
    { value: 'quoted', label: 'Quoted (legacy)' },
  ];

  readonly statusOptions = ['new', 'awaiting_customer_information', 'ready_to_quote', 'quote_sent', 'quote_followed_up', 'follow_up_later', 'converted', 'closed'];

  readonly statusLabels: Record<string, string> = {
    new: 'New enquiry', awaiting_customer_information: 'Awaiting customer information',
    ready_to_quote: 'Ready to quote', quote_sent: 'Quote sent', quote_followed_up: 'Quote followed up',
    follow_up_later: 'Follow up later', converted: 'Converted / Order confirmed', closed: 'Closed / Not proceeding',
    contacted: 'Contacted (legacy)', quoted: 'Quoted (legacy)',
  };

  async ngOnInit(): Promise<void> { await this.load(); }

  async load(status = this.activeTab()): Promise<void> {
    const sequence = ++this.loadSequence;
    this.loading.set(true);
    this.error.set('');
    try {
      const data = await this.adminService.getQueries({ status: status || undefined, enquiry_type: this.activeType() || undefined });
      if (sequence !== this.loadSequence) return;
      this.rows.set(data.rows);
      this.totals.set(data.totals);
      const currentNotes = this.notesMap();
      const nm: Partial<Record<number, string>> = {};
      this.dirtyNoteIds.forEach(id => { nm[id] = currentNotes[id] ?? ''; });
      data.rows.forEach(r => {
        if (!this.dirtyNoteIds.has(r.id)) nm[r.id] = r.admin_notes ?? '';
      });
      this.notesMap.set(nm);
    } catch (e: any) {
      if (sequence === this.loadSequence) this.error.set(e.message || 'Failed to load queries');
    } finally {
      if (sequence === this.loadSequence) this.loading.set(false);
    }
  }

  async setTab(tab: string): Promise<void> {
    this.activeTab.set(tab);
    this.expandedId.set(null);
    await this.load(tab);
  }

  async setType(event: Event): Promise<void> {
    this.activeType.set((event.target as HTMLSelectElement).value);
    this.expandedId.set(null);
    await this.load();
  }

  typeLabel(value: string | null): string {
    return this.typeOptions.find(type => type.value === value)?.label ?? 'Legacy enquiry';
  }

  openManualCreate(): void {
    this.manualForm.reset();
    this.manualSubmitted.set(false);
    this.manualError.set('');
    this.notice.set('');
    this.showManualForm.set(true);
  }

  async saveManual(): Promise<void> {
    if (this.savingManual()) return;
    this.manualSubmitted.set(true);
    if (this.manualForm.invalid) {
      this.manualForm.markAllAsTouched();
      return;
    }
    this.savingManual.set(true);
    this.manualError.set('');
    const { LocationState, LocationSuburb, DiscoverySource, DiscoverySourceDetail, follow_up_date, follow_up_note, ...fields } = enquiryPayload(this.manualForm.getRawValue());
    const payload: ManualQueryInput = { ...fields, name: fields.name.trim(), email: fields.email.trim(),
      location_state: LocationState, location_suburb: LocationSuburb,
      discovery_source: DiscoverySource, discovery_source_detail: DiscoverySourceDetail,
      ...(fields.status === 'follow_up_later' ? { follow_up_date, follow_up_note: follow_up_note.trim() } : {}) };
    try {
      await this.adminService.createQuery(payload);
      this.showManualForm.set(false);
      this.manualForm.reset();
      this.manualSubmitted.set(false);
      this.notice.set('Manual enquiry created. Current filters still apply.');
      await this.load();
    } catch (error: unknown) {
      this.manualError.set(error instanceof Error ? error.message : 'Unable to save the manual enquiry.');
    } finally {
      this.savingManual.set(false);
    }
  }

  toggleExpand(id: number): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  async updateStatus(row: AdminQueryRow, status: string, select?: HTMLSelectElement): Promise<void> {
    if (status === 'follow_up_later') {
      this.followUpForm.reset({ follow_up_date: row.follow_up_date?.slice(0, 10) ?? '', follow_up_note: row.follow_up_note ?? '' });
      this.followUpError.set('');
      this.followUpId.set(row.id);
      return;
    }
    this.followUpId.set(null);
    try {
      await this.adminService.updateQuery(row.id, { status });
      await this.load();
    } catch (e: any) {
      if (select) select.value = row.status;
      await this.modal.alert({ title: 'Update Failed', message: e.message, variant: 'danger' });
    }
  }

  async saveFollowUp(row: AdminQueryRow): Promise<void> {
    if (this.savingFollowUp()) return;
    if (this.followUpForm.invalid) { this.followUpForm.markAllAsTouched(); return; }
    const { follow_up_date, follow_up_note } = this.followUpForm.getRawValue();
    this.savingFollowUp.set(true);
    this.followUpError.set('');
    try {
      await this.adminService.updateQuery(row.id, { status: 'follow_up_later', follow_up_date, follow_up_note: follow_up_note.trim() });
      this.followUpId.set(null);
      await this.load();
    } catch (error: unknown) {
      this.followUpError.set(error instanceof Error ? error.message : 'Unable to save follow-up.');
    } finally { this.savingFollowUp.set(false); }
  }

  setNote(id: number, value: string): void {
    const serverNote = this.rows().find(row => row.id === id)?.admin_notes ?? '';
    if (value === serverNote) this.dirtyNoteIds.delete(id);
    else this.dirtyNoteIds.add(id);
    this.notesMap.update(m => ({ ...m, [id]: value }));
  }

  async saveNotes(row: AdminQueryRow): Promise<void> {
    const admin_notes = this.notesMap()[row.id] ?? '';
    try {
      await this.adminService.updateQuery(row.id, { admin_notes });
      this.rows.update(rs => rs.map(r => r.id === row.id ? { ...r, admin_notes } : r));
      if ((this.notesMap()[row.id] ?? '') === admin_notes) this.dirtyNoteIds.delete(row.id);
      else this.dirtyNoteIds.add(row.id);
    } catch (e: any) {
      await this.modal.alert({ title: 'Save Failed', message: e.message, variant: 'danger' });
    }
  }

  tabCount(tab: string): number {
    const t = this.totals();
    if (!t) return 0;
    const map: Record<string, string> = {
      '': 'total', new: 'new_count', contacted: 'contacted',
      quoted: 'legacy_quoted', converted: 'converted', closed: 'closed',
      awaiting_customer_information: 'awaiting_customer_information', ready_to_quote: 'ready_to_quote',
      quote_sent: 'quote_sent', quote_followed_up: 'quote_followed_up', follow_up_later: 'follow_up_later',
    };
    return Number(t[map[tab]] || 0);
  }
}
