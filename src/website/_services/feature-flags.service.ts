import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FeatureFlagsService {
  // ─── MAINTENANCE TOGGLES ──────────────────────────────────────────────────
  // Set to false to show "Coming Soon" and take the feature offline for maintenance.

  /** Quote request form, partner/contact form, email submissions */
  emailsEnabled = true;
  // ──────────────────────────────────────────────────────────────────────────
}
