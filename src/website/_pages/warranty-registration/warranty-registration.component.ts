import { ChangeDetectionStrategy, Component, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule } from '@angular/router';

const WARRANTY_URL = 'https://www.navrik.co.za/register-warranty';

@Component({
  selector: 'website-warranty-registration',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, RouterModule],
  templateUrl: './warranty-registration.component.html',
  styleUrl: './warranty-registration.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WarrantyRegistrationPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly platformId = inject(PLATFORM_ID);
  submitted = false;
  submitting = false;
  registrationReference = '';
  error = '';
  readonly warrantyUrl = WARRANTY_URL;
  readonly maxVehicleYear = new Date().getFullYear() + 1;
  registrationToken = '';
  readonly form = this.fb.nonNullable.group({
    vehicleMake: ['', [Validators.required, Validators.maxLength(80)]],
    vehicleModel: ['', [Validators.required, Validators.maxLength(100)]],
    vehicleYear: [new Date().getFullYear(), [Validators.required, Validators.min(1900), Validators.max(this.maxVehicleYear)]],
    vehicleRegistration: ['', [Validators.required, Validators.maxLength(32)]],
    purchaseDate: ['', Validators.required],
    fitmentDate: ['', Validators.required],
    consent: [false, Validators.requiredTrue],
  });

  fieldInvalid(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return this.submitted && control.invalid;
  }

  ngOnInit(): void {
    // Fragments never reach Netlify/CDN logs or Referer headers. Clear the
    // one-use credential from the address bar and browser history at startup.
    if (isPlatformBrowser(this.platformId)) {
      const token = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
      if (/^[A-Za-z0-9_-]{32,128}$/.test(token)) this.registrationToken = token;
      if (window.location.hash) window.history.replaceState(window.history.state, '', '/register-warranty');
    }
  }

  async submit(): Promise<void> {
    this.submitted = true;
    this.error = '';
    if (!this.registrationToken) {
      this.error = 'Open the secure warranty link in your Navrik order confirmation email. If you cannot find it, contact the Navrik team with your proof of purchase.';
      return;
    }
    if (this.form.invalid) return;
    this.submitting = true;
    try {
      const response = await fetch('/api/warranty-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: this.registrationToken, ...this.form.getRawValue() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'Could not register the warranty.');
      this.registrationReference = payload.registrationReference;
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Could not register the warranty. Please try again.';
    } finally {
      this.submitting = false;
    }
  }
}
