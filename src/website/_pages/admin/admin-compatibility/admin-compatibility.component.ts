import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AdminService, CompatibilityRule, CatalogAccessory, CatalogProduct } from '../../../_services/admin.service';
import { ModalService } from '../../../_services/modal.service';

@Component({
  selector: 'website-admin-compatibility',
  templateUrl: './admin-compatibility.component.html',
  styleUrls: ['./admin-compatibility.component.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
})
export class AdminCompatibilityComponent implements OnInit {
  private adminService = inject(AdminService);
  private fb = inject(FormBuilder);
  private modal = inject(ModalService);

  rules        = signal<CompatibilityRule[]>([]);
  accessories  = signal<CatalogAccessory[]>([]);
  products     = signal<CatalogProduct[]>([]);
  loading      = signal(true);
  saving       = signal(false);
  error        = signal('');
  showForm     = signal(false);

  readonly trayTypes = [
    { value: null,       label: 'Any / All' },
    { value: 'standard', label: 'Standard' },
    { value: 'premium',  label: 'Premium' },
  ];

  form = this.fb.nonNullable.group({
    accessory_id:  [0],
    tray_type:     [null as 'standard' | 'premium' | null],
    product_id:    [null as number | null],
    vehicle_make:  [''],
    vehicle_model: [''],
    notes:         [''],
  });

  /** Rules grouped by accessory for matrix view */
  grouped = computed(() => {
    const map = new Map<number, { accessory: CatalogAccessory; rules: CompatibilityRule[] }>();
    for (const acc of this.accessories()) {
      map.set(acc.id!, { accessory: acc, rules: [] });
    }
    for (const r of this.rules()) {
      const group = map.get(r.accessory_id);
      if (group) group.rules.push(r);
    }
    return [...map.values()].filter(g => g.rules.length > 0 || this.accessories().length === 0);
  });

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      const [rules, accessories, products] = await Promise.all([
        this.adminService.getCompatibility(),
        this.adminService.getAccessories(),
        this.adminService.getProducts(),
      ]);
      this.rules.set(rules);
      this.accessories.set(accessories);
      this.products.set(products);
    } catch (e: any) {
      this.error.set(e.message);
    } finally {
      this.loading.set(false);
    }
  }

  openCreate(): void {
    this.form.reset({
      accessory_id:  0,
      tray_type:     null,
      product_id:    null,
      vehicle_make:  '',
      vehicle_model: '',
      notes:         '',
    });
    this.showForm.set(true);
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.error.set('');
  }

  async save(): Promise<void> {
    if (this.saving()) return;
    const raw = this.form.getRawValue();
    if (!raw.accessory_id) {
      this.error.set('Select an accessory before adding a rule.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const rule: Omit<CompatibilityRule, 'id'> = {
        accessory_id:  Number(raw.accessory_id),
        tray_type:     raw.tray_type || null,
        product_id:    raw.product_id ? Number(raw.product_id) : null,
        vehicle_make:  raw.vehicle_make || null,
        vehicle_model: raw.vehicle_model || null,
        notes:         raw.notes || null,
      };
      const created = await this.adminService.addCompatibilityRule(rule);
      const acc = this.accessories().find(a => a.id === created.accessory_id);
      this.rules.update(list => [...list, {
        ...created,
        accessory_name: acc?.name,
        accessory_category: acc?.category,
      }]);
      this.cancelForm();
    } catch (e: any) {
      this.error.set(e.error?.error || e.message || 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }

  async remove(rule: CompatibilityRule): Promise<void> {
    const label = rule.accessory_name || `Rule #${rule.id}`;
    const ok = await this.modal.confirm({
      title: 'Remove Rule',
      message: `Remove compatibility rule for "${label}"?`,
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await this.adminService.deleteCompatibilityRule(rule.id!);
      this.rules.update(list => list.filter(r => r.id !== rule.id));
    } catch (e: any) {
      this.error.set(e.message);
    }
  }

  productName(id: number | null): string {
    if (!id) return '—';
    return this.products().find(p => p.id === id)?.name ?? `#${id}`;
  }

  accessoryName(id: number): string {
    return this.accessories().find(a => a.id === id)?.name ?? `#${id}`;
  }
}
