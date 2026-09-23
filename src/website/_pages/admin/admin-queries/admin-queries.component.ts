import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AdminService } from '../../../_services/admin.service';
import { ModalService } from '../../../_services/modal.service';

@Component({
  selector: 'website-admin-queries',
  templateUrl: './admin-queries.component.html',
  styleUrls: ['./admin-queries.component.scss'],
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, MatIconModule],
})
export class AdminQueriesComponent implements OnInit {
  private adminService = inject(AdminService);
  private modal = inject(ModalService);

  rows       = signal<any[]>([]);
  totals     = signal<any>(null);
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
    this.loading.set(true);
    try {
      const data = await this.adminService.getQueries({ status: status || undefined });
      this.rows.set(data.rows);
      this.totals.set(data.totals);
      const nm: Partial<Record<number, string>> = {};
      data.rows.forEach((r: any) => { nm[r.id] = r.admin_notes || ''; });
      this.notesMap.set(nm);
    } catch (e: any) {
      this.error.set(e.message || 'Failed to load queries');
    } finally {
      this.loading.set(false);
    }
  }

  async setTab(tab: string): Promise<void> {
    this.activeTab.set(tab);
    this.expandedId.set(null);
    await this.load(tab);
  }

  toggleExpand(id: number): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  async updateStatus(row: any, status: string): Promise<void> {
    try {
      await this.adminService.updateQuery(row.id, { status });
      this.rows.update(rs => rs.map(r => r.id === row.id ? { ...r, status } : r));
    } catch (e: any) {
      await this.modal.alert({ title: 'Update Failed', message: e.message, variant: 'danger' });
    }
  }

  setNote(id: number, value: string): void {
    this.notesMap.update(m => ({ ...m, [id]: value }));
  }

  async saveNotes(row: any): Promise<void> {
    const admin_notes = this.notesMap()[row.id] ?? '';
    try {
      await this.adminService.updateQuery(row.id, { admin_notes });
      this.rows.update(rs => rs.map(r => r.id === row.id ? { ...r, admin_notes } : r));
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
    return parseInt(t[map[tab]] || '0', 10);
  }
}
