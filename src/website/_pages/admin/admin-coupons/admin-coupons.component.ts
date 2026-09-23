import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AdminService } from '../../../_services/admin.service';
import { ModalService } from '../../../_services/modal.service';

@Component({
  selector: 'website-admin-coupons',
  templateUrl: './admin-coupons.component.html',
  styleUrls: ['./admin-coupons.component.scss'],
  standalone: true,
  imports: [CommonModule, DatePipe, ReactiveFormsModule, MatIconModule],
})
export class AdminCouponsComponent implements OnInit {
  private adminService = inject(AdminService);
  private fb           = inject(FormBuilder);
  private modal        = inject(ModalService);

  coupons    = signal<any[]>([]);
  loading    = signal(true);
  saving     = signal(false);
  showCreate = signal(false);
  error      = signal('');
  saveError  = signal('');

  form = this.fb.nonNullable.group({
    code:          ['', Validators.required],
    description:   [''],
    discount_type: ['percent', Validators.required],
    discount_value:['', [Validators.required, Validators.min(0.01)]],
    min_order_zar: [''],
    max_uses:      [''],
    expires_at:    [''],
  });

  // ── Launch promo (promo_config) ─────────────────────────────
  promoLoading = signal(true);
  promoSaving  = signal(false);
  promoError   = signal('');
  slotsUsed    = signal(0);

  promoForm = this.fb.nonNullable.group({
    is_active:                      [false],
    max_promo_slots:                [25, [Validators.required, Validators.min(0)]],
    discount_percent:                [5, [Validators.required, Validators.min(0), Validators.max(100)]],
    standard_installation_cost_zar: [2500, [Validators.required, Validators.min(0)]],
    deposit_percent:                [20, [Validators.required, Validators.min(1), Validators.max(100)]],
  });

  async ngOnInit(): Promise<void> {
    await Promise.all([this.load(), this.loadPromoConfig()]);
  }

  async loadPromoConfig(): Promise<void> {
    this.promoLoading.set(true);
    try {
      const cfg = await this.adminService.getPromoConfig();
      this.promoForm.patchValue({
        is_active: !!cfg.is_active,
        max_promo_slots: Number(cfg.max_promo_slots),
        discount_percent: Number(cfg.discount_percent),
        standard_installation_cost_zar: Number(cfg.standard_installation_cost_zar),
        deposit_percent: Number(cfg.deposit_percent),
      });
      this.slotsUsed.set(Number(cfg.slots_used ?? 0));
    } catch (e: any) {
      this.promoError.set(e.message || 'Failed to load launch promo settings');
    } finally {
      this.promoLoading.set(false);
    }
  }

  async savePromoConfig(): Promise<void> {
    if (this.promoForm.invalid || this.promoSaving()) {
      this.promoForm.markAllAsTouched();
      return;
    }
    this.promoSaving.set(true);
    this.promoError.set('');
    try {
      const v = this.promoForm.getRawValue();
      await this.adminService.updatePromoConfig(v);
      await this.modal.alert({ title: 'Saved', message: 'Launch promo settings updated — changes are live now.' });
    } catch (e: any) {
      await this.modal.alert({ title: 'Save Failed', message: e.error?.error || e.message || 'Unknown error', variant: 'danger' });
    } finally {
      this.promoSaving.set(false);
    }
  }

  async load(): Promise<void> {
    try {
      this.coupons.set(await this.adminService.getCoupons());
    } catch (e: any) {
      this.error.set(e.message || 'Failed to load coupons');
    } finally {
      this.loading.set(false);
    }
  }

  async onCreate(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.saveError.set('');
    try {
      const v = this.form.getRawValue();
      const payload: any = {
        code:          v.code,
        description:   v.description || null,
        discount_type: v.discount_type,
        discount_value:parseFloat(v.discount_value),
        min_order_zar: v.min_order_zar ? parseFloat(v.min_order_zar) : null,
        max_uses:      v.max_uses      ? parseInt(v.max_uses, 10)     : null,
        expires_at:    v.expires_at    || null,
      };
      const created = await this.adminService.createCoupon(payload);
      this.coupons.update(cs => [created, ...cs]);
      this.form.reset({ discount_type: 'percent' });
      this.showCreate.set(false);
    } catch (e: any) {
      this.saveError.set(e.error?.error || e.message || 'Failed to create coupon');
    } finally {
      this.saving.set(false);
    }
  }

  async toggleActive(coupon: any): Promise<void> {
    try {
      await this.adminService.updateCoupon({ id: coupon.id, is_active: !coupon.is_active });
      this.coupons.update(cs =>
        cs.map(c => c.id === coupon.id ? { ...c, is_active: !c.is_active } : c)
      );
    } catch (e: any) {
      await this.modal.alert({ title: 'Update Failed', message: e.message, variant: 'danger' });
    }
  }

  async onDelete(coupon: any): Promise<void> {
    const ok = await this.modal.confirm({
      title: 'Delete Voucher',
      message: `Soft-delete coupon "${coupon.code}"? It will no longer be usable at checkout.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await this.adminService.deleteCoupon(coupon.id);
      this.coupons.update(cs => cs.filter(c => c.id !== coupon.id));
    } catch (e: any) {
      await this.modal.alert({ title: 'Delete Failed', message: e.message, variant: 'danger' });
    }
  }

  isExpired(coupon: any): boolean {
    return coupon.expires_at && new Date(coupon.expires_at) < new Date();
  }

  isExhausted(coupon: any): boolean {
    return coupon.max_uses !== null && coupon.current_uses >= coupon.max_uses;
  }

  couponStatus(coupon: any): 'active' | 'inactive' | 'expired' | 'exhausted' {
    if (this.isExpired(coupon))   return 'expired';
    if (this.isExhausted(coupon)) return 'exhausted';
    if (!coupon.is_active)        return 'inactive';
    return 'active';
  }
}
