import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AdminService } from '../../../_services/admin.service';
import { ModalService } from '../../../_services/modal.service';
import {
  LegalItem, LegalItemType, LegalSection,
  DEFAULT_REFUND_POLICY, DEFAULT_TERMS_OF_SERVICE,
} from '../../../_models/legal-page.models';

type LegalPageKey = 'refund' | 'terms';

const DEFAULTS: Record<LegalPageKey, typeof DEFAULT_REFUND_POLICY> = {
  refund: DEFAULT_REFUND_POLICY,
  terms: DEFAULT_TERMS_OF_SERVICE,
};

@Component({
  selector: 'website-admin-legal-pages',
  templateUrl: './admin-legal-pages.component.html',
  styleUrls: ['./admin-legal-pages.component.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
})
export class AdminLegalPagesComponent implements OnInit {
  private adminService = inject(AdminService);
  private modal = inject(ModalService);
  private fb = inject(FormBuilder);

  readonly pages: { id: LegalPageKey; label: string }[] = [
    { id: 'refund', label: 'Refund & Warranty Policy' },
    { id: 'terms',  label: 'Terms of Service' },
  ];
  activePage = signal<LegalPageKey>('refund');

  readonly itemTypes: { value: LegalItemType; label: string }[] = [
    { value: 'covered',  label: 'Covered (green)'  },
    { value: 'excluded', label: 'Excluded (amber)' },
    { value: 'check',    label: 'Checklist (neutral)' },
    { value: 'plain',    label: 'Plain / note' },
  ];

  loading = signal(true);
  saving  = signal(false);
  error   = signal('');
  usingDefaults = signal(false);

  sections = signal<LegalSection[]>([]);
  disclaimerParagraphs = signal<string[]>([]);

  form = this.fb.nonNullable.group({
    badge:            ['', Validators.required],
    title_main:       ['', Validators.required],
    title_highlight:  ['', Validators.required],
    intro:            [''],
    disclaimer_title: [''],
  });

  async ngOnInit(): Promise<void> {
    await this.loadPage(this.activePage());
  }

  async switchPage(page: LegalPageKey): Promise<void> {
    if (page === this.activePage()) return;
    this.activePage.set(page);
    await this.loadPage(page);
  }

  private async loadPage(page: LegalPageKey): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const c = await this.adminService.getLegalPage(page);
      const isEmpty = !c || Object.keys(c).length === 0;
      const defaults = DEFAULTS[page];
      const merged = { ...defaults, ...c };

      this.form.patchValue({
        badge: merged.badge,
        title_main: merged.title_main,
        title_highlight: merged.title_highlight,
        intro: merged.intro,
        disclaimer_title: merged.disclaimer_title,
      });
      this.sections.set(merged.sections.map(s => ({ ...s, items: s.items.map(i => ({ ...i })) })));
      this.disclaimerParagraphs.set([...merged.disclaimer_paragraphs]);
      this.usingDefaults.set(isEmpty);
    } catch (e: any) {
      this.error.set(e.message || 'Failed to load page content');
    } finally {
      this.loading.set(false);
    }
  }

  private markCustom(): void { this.usingDefaults.set(false); }

  // ── Sections ───────────────────────────────────────────────
  addSection(): void {
    this.markCustom();
    this.sections.update(list => [...list, { icon: 'info', title: '', intro: '', items: [] }]);
  }

  updateSectionField(index: number, field: 'icon' | 'title' | 'intro', value: string): void {
    this.markCustom();
    this.sections.update(list => list.map((s, i) => i === index ? { ...s, [field]: value } : s));
  }

  removeSection(index: number): void {
    this.markCustom();
    this.sections.update(list => list.filter((_, i) => i !== index));
  }

  moveSection(index: number, dir: -1 | 1): void {
    this.markCustom();
    this.sections.update(list => {
      const next = [...list];
      const target = index + dir;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  // ── Section items ──────────────────────────────────────────
  addItem(sectionIndex: number): void {
    this.markCustom();
    this.sections.update(list => list.map((s, i) =>
      i === sectionIndex ? { ...s, items: [...s.items, { text: '', type: 'plain' as LegalItemType }] } : s
    ));
  }

  updateItem(sectionIndex: number, itemIndex: number, field: keyof LegalItem, value: string): void {
    this.markCustom();
    this.sections.update(list => list.map((s, i) => {
      if (i !== sectionIndex) return s;
      return { ...s, items: s.items.map((it, j) => j === itemIndex ? { ...it, [field]: value } : it) };
    }));
  }

  removeItem(sectionIndex: number, itemIndex: number): void {
    this.markCustom();
    this.sections.update(list => list.map((s, i) => {
      if (i !== sectionIndex) return s;
      return { ...s, items: s.items.filter((_, j) => j !== itemIndex) };
    }));
  }

  // ── Disclaimer paragraphs (refund policy only) ────────────
  addDisclaimerParagraph(): void {
    this.markCustom();
    this.disclaimerParagraphs.update(list => [...list, '']);
  }

  updateDisclaimerParagraph(index: number, value: string): void {
    this.markCustom();
    this.disclaimerParagraphs.update(list => list.map((p, i) => i === index ? value : p));
  }

  removeDisclaimerParagraph(index: number): void {
    this.markCustom();
    this.disclaimerParagraphs.update(list => list.filter((_, i) => i !== index));
  }

  // ── Save ───────────────────────────────────────────────────
  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const v = this.form.getRawValue();
      const payload = {
        badge: v.badge,
        title_main: v.title_main,
        title_highlight: v.title_highlight,
        intro: v.intro,
        sections: this.sections()
          .filter(s => s.title.trim())
          .map(s => ({ ...s, items: s.items.filter(it => it.text.trim()) })),
        disclaimer_title: v.disclaimer_title,
        disclaimer_paragraphs: this.disclaimerParagraphs().filter(p => p.trim()),
      };
      await this.adminService.updateLegalPage(this.activePage(), payload as any);
      this.usingDefaults.set(false);
      await this.modal.alert({ title: 'Saved', message: 'Page content updated — changes are live now.' });
    } catch (e: any) {
      await this.modal.alert({ title: 'Save Failed', message: e.error?.error || e.message || 'Unknown error', variant: 'danger' });
    } finally {
      this.saving.set(false);
    }
  }
}
