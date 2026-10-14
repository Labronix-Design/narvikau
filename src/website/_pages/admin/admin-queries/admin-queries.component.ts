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
    enquiry_type: ['general_contact', Validators.required],
    ...enquiryControls(),
  }, { validators: [sourceDetailRequiredValidator, form => {
    const type = form.get('enquiry_type')?.value;
    if (['dealer_enquiry', 'fitment_enquiry'].includes(type) && !form.get('company')?.value.trim()) return { companyRequired: true };
    if (type === 'product_quote' && !form.get('product')?.value.trim()) return { productRequired: true };
    return null;
  }] });

  rows       = signal<AdminQueryRow[]>([]);
  totals     = signal<AdminQueryTotals | null>(null);
  loading    = signal(true);
  error      = signal('');
  activeTab  = signal<string>('');
  expandedId = signal<number | null>(null);
  notesMap   = signal<Partial<Record<number, string>>>({});

  readonly tabs = [
    { value: '',          label: 'All'        },
    { value: 'new',       label: 'New'        },
    { value: 'contacted', label: 'Contacted'  },
    { value: 'quoted',    label: 'Quoted'     },
    { value: 'converted', label: 'Converted'  },
    { value: 'closed',    label: 'Closed'     },
  ];

  readonly statusOptions = ['new', 'contacted', 'quoted', 'converted', 'closed'];

  readonly statusLabels: Record<string, string> = {
    new:       'New',
    contacted: 'Contacted',
    quoted:    'Quoted',
    converted: 'Converted',
    closed:    'Closed',
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
    const { LocationState, LocationSuburb, DiscoverySource, DiscoverySourceDetail, ...fields } = enquiryPayload(this.manualForm.getRawValue());
    const payload: ManualQueryInput = { ...fields, name: fields.name.trim(), email: fields.email.trim(),
      location_state: LocationState, location_suburb: LocationSuburb,
      discovery_source: DiscoverySource, discovery_source_detail: DiscoverySourceDetail };
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

  async updateStatus(row: AdminQueryRow, status: string): Promise<void> {
    try {
      await this.adminService.updateQuery(row.id, { status });
      await this.load();
    } catch (e: any) {
      await this.modal.alert({ title: 'Update Failed', message: e.message, variant: 'danger' });
    }
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
      quoted: 'quoted', converted: 'converted', closed: 'closed',
    };
    return Number(t[map[tab]] || 0);
  }
}
