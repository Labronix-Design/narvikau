import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AdminService } from '../../../_services/admin.service';
import { ModalService } from '../../../_services/modal.service';
import { ImageUploadComponent } from '../../../_components/image-upload/image-upload.component';
import {
  FinanceBenefit, FinanceStep, FinanceTrustItem, DEFAULT_FINANCE_CONTENT,
} from '../../../_models/finance-page.models';

@Component({
  selector: 'website-admin-finance-content',
  templateUrl: './admin-finance-content.component.html',
  styleUrls: ['./admin-finance-content.component.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, ImageUploadComponent],
})
export class AdminFinanceContentComponent implements OnInit {
  private adminService = inject(AdminService);
  private modal = inject(ModalService);
  private fb = inject(FormBuilder);

  loading = signal(true);
  saving  = signal(false);
  error   = signal('');
  usingDefaults = signal(false);

  benefits = signal<FinanceBenefit[]>([]);
  steps = signal<FinanceStep[]>([]);
  requirements = signal<string[]>([]);
  trustItems = signal<FinanceTrustItem[]>([]);

  form = this.fb.nonNullable.group({
    hero_badge:        ['', Validators.required],
    hero_subtitle:     ['', Validators.required],
    apply_url:         ['', Validators.required],
    partner_logo_url:  [''],
    requirements_note: [''],
    cta_title:         ['', Validators.required],
    cta_body:          ['', Validators.required],
    cta_disclaimer:    [''],
  });

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      const c = await this.adminService.getFinancePageContent();
      const isEmpty = !c || Object.keys(c).length === 0;
      const merged = { ...DEFAULT_FINANCE_CONTENT, ...c };

      this.form.patchValue({
        hero_badge: merged.hero_badge,
        hero_subtitle: merged.hero_subtitle,
        apply_url: merged.apply_url,
        partner_logo_url: merged.partner_logo_url,
        requirements_note: merged.requirements_note,
        cta_title: merged.cta_title,
        cta_body: merged.cta_body,
        cta_disclaimer: merged.cta_disclaimer,
      });
      this.benefits.set(merged.benefits.map(x => ({ ...x })));
      this.steps.set(merged.steps.map(x => ({ ...x })));
      this.requirements.set([...merged.requirements]);
      this.trustItems.set(merged.trust_items.map(x => ({ ...x })));
      this.usingDefaults.set(isEmpty);
    } catch (e: any) {
      this.error.set(e.message || 'Failed to load finance page content');
    } finally {
      this.loading.set(false);
    }
  }

  private markCustom(): void { this.usingDefaults.set(false); }

  // ── Benefits ───────────────────────────────────────────────
  addBenefit(): void {
    this.markCustom();
    this.benefits.update(list => [...list, { icon: 'verified', title: '', desc: '' }]);
  }
  updateBenefit(index: number, field: keyof FinanceBenefit, value: string): void {
    this.markCustom();
    this.benefits.update(list => list.map((b, i) => i === index ? { ...b, [field]: value } : b));
  }
  removeBenefit(index: number): void {
    this.markCustom();
    this.benefits.update(list => list.filter((_, i) => i !== index));
  }

  // ── Steps ──────────────────────────────────────────────────
  addStep(): void {
    this.markCustom();
    this.steps.update(list => [...list, { num: String(list.length + 1).padStart(2, '0'), title: '', desc: '' }]);
  }
  updateStep(index: number, field: keyof FinanceStep, value: string): void {
    this.markCustom();
    this.steps.update(list => list.map((s, i) => i === index ? { ...s, [field]: value } : s));
  }
  removeStep(index: number): void {
    this.markCustom();
    this.steps.update(list => list.filter((_, i) => i !== index));
  }

  // ── Requirements ───────────────────────────────────────────
  addRequirement(): void {
    this.markCustom();
    this.requirements.update(list => [...list, '']);
  }
  updateRequirement(index: number, value: string): void {
    this.markCustom();
    this.requirements.update(list => list.map((r, i) => i === index ? value : r));
  }
  removeRequirement(index: number): void {
    this.markCustom();
    this.requirements.update(list => list.filter((_, i) => i !== index));
  }

  // ── Trust items ────────────────────────────────────────────
  addTrustItem(): void {
    this.markCustom();
    this.trustItems.update(list => [...list, { icon: 'verified', label: '' }]);
  }
  updateTrustItem(index: number, field: keyof FinanceTrustItem, value: string): void {
    this.markCustom();
    this.trustItems.update(list => list.map((t, i) => i === index ? { ...t, [field]: value } : t));
  }
  removeTrustItem(index: number): void {
    this.markCustom();
    this.trustItems.update(list => list.filter((_, i) => i !== index));
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
        hero_badge: v.hero_badge,
        hero_title: DEFAULT_FINANCE_CONTENT.hero_title,
        hero_subtitle: v.hero_subtitle,
        apply_url: v.apply_url,
        partner_logo_url: v.partner_logo_url,
        benefits: this.benefits().filter(b => b.title.trim()),
        steps: this.steps().filter(s => s.title.trim()),
        requirements: this.requirements().filter(r => r.trim()),
        requirements_note: v.requirements_note,
        cta_title: v.cta_title,
        cta_body: v.cta_body,
        cta_disclaimer: v.cta_disclaimer,
        trust_items: this.trustItems().filter(t => t.label.trim()),
      };
      await this.adminService.updateFinancePageContent(payload as any);
      this.usingDefaults.set(false);
      await this.modal.alert({ title: 'Saved', message: 'Finance page content updated — changes are live now.' });
    } catch (e: any) {
      await this.modal.alert({ title: 'Save Failed', message: e.error?.error || e.message || 'Unknown error', variant: 'danger' });
    } finally {
      this.saving.set(false);
    }
  }
}
