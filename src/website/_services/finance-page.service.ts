import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { FinancePageContent, DEFAULT_FINANCE_CONTENT } from '../_models/finance-page.models';

@Injectable({ providedIn: 'root' })
export class FinancePageService {
  private http = inject(HttpClient);

  readonly content = signal<FinancePageContent>(DEFAULT_FINANCE_CONTENT);
  /** True only when the public finance-content endpoint failed to respond. */
  readonly unavailable = signal(false);
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const partial = await firstValueFrom(this.http.get<Partial<FinancePageContent>>('/api/finance-page'));
      this.content.set(this.mergeWithDefaults(partial));
      this.unavailable.set(false);
    } catch (err) {
      console.error('FinancePageService load failed:', err);
      this.unavailable.set(true);
      this.loaded = false;
    }
  }

  // Field-by-field fallback — an admin who's only edited the hero shouldn't
  // lose the default benefit cards, steps, etc.
  private mergeWithDefaults(partial: Partial<FinancePageContent>): FinancePageContent {
    const merged = { ...DEFAULT_FINANCE_CONTENT };
    for (const key of Object.keys(DEFAULT_FINANCE_CONTENT) as (keyof FinancePageContent)[]) {
      const value = partial[key];
      if (Array.isArray(value)) {
        if (value.length) (merged as any)[key] = value;
      } else if (typeof value === 'string' && value.trim()) {
        (merged as any)[key] = value;
      }
    }
    return merged;
  }
}
