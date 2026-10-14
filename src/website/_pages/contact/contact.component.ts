import { EnquiryLocationComponent } from '../../_components/enquiry-location/enquiry-location.component';
import { enquiryControls, enquiryPayload } from '../../_models/enquiry-location.models';
import { ENQUIRY_SOURCE_OPTIONS, sourceRequiresDetail, sourceDetailRequiredValidator } from '../../_models/enquiry-source.models';
import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { ChangeDetectorRef } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ToastService } from '../../_services/toast.service';
import { SiteSettingsService } from '../../_services/site-settings.service';
import { AnalyticsService } from '../../_services/analytics.service';

@Component({
  selector: 'website-contact',
  templateUrl: './contact.component.html',
  styleUrls: ['./contact.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, EnquiryLocationComponent, ReactiveFormsModule, RouterModule, MatIconModule],
})
export class ContactPage implements OnInit {
  private fb      = inject(FormBuilder);
  private toast   = inject(ToastService);
  private analytics = inject(AnalyticsService);
  siteSettings    = inject(SiteSettingsService);

  readonly sourceOptions = ENQUIRY_SOURCE_OPTIONS;
  readonly sourceRequiresDetail = sourceRequiresDetail;
  private readonly changeDetector = inject(ChangeDetectorRef);
  submitted = false;
  isLoading = false;

  form = this.fb.nonNullable.group({
    Name:    ['', Validators.required],
    Surname: [''],                                         // company / dealership (optional)
    Phone:   ['', Validators.required],
    Email:   ['', [Validators.required, Validators.email]],
    Message: ['', Validators.required],
    ...enquiryControls(),
  }, { validators: sourceDetailRequiredValidator });

  ngOnInit(): void {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  fieldInvalid(name: keyof typeof this.form.controls): boolean {
    const ctrl = this.form.controls[name];
    return this.submitted && ctrl.invalid;
  }

  async onSubmit(): Promise<void> {
    if (this.isLoading) return;
    this.submitted = true;
    if (this.form.invalid) {
      this.toast.showToast({ message: 'Please complete all required fields.', type: 'error' });
      return;
    }

    this.isLoading = true;
    try {
      const res = await fetch('/api/contact-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(enquiryPayload(this.form.getRawValue())),
      });

      if (!res.ok) throw new Error(await res.text());

      this.analytics.trackMetaLead();
      this.form.reset();
      this.submitted = false;
      this.toast.showToast({
        message: "Message sent! We'll be in touch within 1 business day.",
        type: 'success',
        duration: 6000,
      });
    } catch {
      this.toast.showToast({
        message: `Submission failed — please email us directly at ${this.siteSettings.settings().contact.email}`,
        type: 'error',
        duration: 8000,
      });
    } finally {
      this.isLoading = false;
      this.changeDetector.markForCheck();
    }
  }
}
