import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { PromoStatus } from '../_models/promo.models';

const INACTIVE: PromoStatus = { active: false, discountPercent: 0, slotsRemaining: 0, maxSlots: 0 };

@Injectable({ providedIn: 'root' })
export class PromoService {
  private http = inject(HttpClient);

  // null = not yet resolved. Callers should treat null the same as inactive
  // so the UI never flashes promo messaging before the real state is known.
  private _status = signal<PromoStatus | null>(null);
  private _loaded = false;

  readonly status = this._status.asReadonly();

  async load(): Promise<void> {
    if (this._loaded) return;
    this._loaded = true;
    try {
      const status = await firstValueFrom(this.http.get<PromoStatus>('/api/promo-status'));
      this._status.set(status);
    } catch (err) {
      console.error('PromoService load failed:', err);
      this._status.set(INACTIVE);
    }
  }
}
