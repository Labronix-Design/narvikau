import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule } from '@angular/router';

const WARRANTY_URL = 'https://www.navrik.com.au/register-warranty';

@Component({
  selector: 'website-warranty-registration',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, RouterModule],
  templateUrl: './warranty-registration.component.html',
  styleUrl: './warranty-registration.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WarrantyRegistrationPage {
  private readonly fb = inject(FormBuilder);
  submitted = false;
  submitting = false;
  registrationReference = '';
  error = '';
  readonly warrantyUrl = WARRANTY_URL;
  readonly maxVehicleYear = new Date().getFullYear() + 1;
  readonly form = this.fb.nonNullable.group({
    purchaserName: ['', [Validators.required, Validators.maxLength(160)]],
    purchaserEmail: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    purchaserPhone: ['', [Validators.required, Validators.maxLength(50)]],
    productName: ['', [Validators.required, Validators.maxLength(160)]],
    purchaseReference: ['', Validators.maxLength(160)],
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

  async submit(): Promise<void> {
    this.submitted = true;
    this.error = '';
    if (this.form.invalid) return;
    this.submitting = true;
    try {
      const response = await fetch('/api/warranty-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.form.getRawValue()),
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
