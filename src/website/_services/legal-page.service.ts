import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  LegalPageContent, DEFAULT_REFUND_POLICY, DEFAULT_TERMS_OF_SERVICE,
} from '../_models/legal-page.models';

const DEFAULTS: Record<'refund' | 'terms', LegalPageContent> = {
  refund: DEFAULT_REFUND_POLICY,
  terms: DEFAULT_TERMS_OF_SERVICE,
};

@Injectable({ providedIn: 'root' })
export class LegalPageService {
  private http = inject(HttpClient);
  /** True only when the public legal-content endpoint failed to respond. */
  readonly unavailable = signal(false);

  async load(page: 'refund' | 'terms'): Promise<LegalPageContent | null> {
    const defaults = DEFAULTS[page];
    try {
      const partial = await firstValueFrom(this.http.get<Partial<LegalPageContent>>(`/api/legal-pages?page=${page}`));
      this.unavailable.set(false);
      return this.mergeWithDefaults(defaults, partial);
    } catch (err) {
      console.error('LegalPageService load failed:', err);
      this.unavailable.set(true);
      return null;
    }
  }

  // Field-by-field fallback — an admin who's only edited the intro shouldn't
  // lose the default sections/disclaimer.
  private mergeWithDefaults(defaults: LegalPageContent, partial: Partial<LegalPageContent>): LegalPageContent {
    const merged = { ...defaults };
    for (const key of Object.keys(defaults) as (keyof LegalPageContent)[]) {
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
