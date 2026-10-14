import { EnquiryLocationComponent } from '../../_components/enquiry-location/enquiry-location.component';
import { enquiryControls, enquiryPayload } from '../../_models/enquiry-location.models';
import { ENQUIRY_SOURCE_OPTIONS, sourceRequiresDetail, sourceDetailRequiredValidator } from '../../_models/enquiry-source.models';
import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, OnDestroy, Output, inject, signal } from '@angular/core';
import { ChangeDetectorRef } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { ButtonComponent } from '../button/button.component';
import { ToastService } from '../../_services/toast.service';
import { FeatureFlagsService } from '../../_services/feature-flags.service';
import { SiteSettingsService } from '../../_services/site-settings.service';
import { AnalyticsService } from '../../_services/analytics.service';

@Component({
  selector: 'website-quote-modal',
  templateUrl: './quote-modal.component.html',
  styleUrls: ['./quote-modal.component.scss'],
  standalone: true,
  imports: [CommonModule, EnquiryLocationComponent, ReactiveFormsModule, MatIconModule, ButtonComponent, CdkTrapFocus],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuoteModalComponent implements OnDestroy {
  private _isOpen = false;
  private restoreFocusTarget: HTMLElement | null = null;
  @Input() set isOpen(val: boolean) {
    if (this._isOpen === val) return;
    this._isOpen = val;
    if (typeof document !== 'undefined') {
      if (val) {
        this.restoreFocusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
        this.restoreFocus();
      }
    }
  }
  get isOpen(): boolean { return this._isOpen; }

  @Input() set preSelectedProduct(val: string) {
    // A general enquiry deliberately arrives without a selected item. Clear a
    // previous card selection so its product name cannot leak into that quote.
    this.selectedProduct.set(val || '');
  }

  @Output() closeModal = new EventEmitter<void>();

  readonly flags = inject(FeatureFlagsService);
  readonly siteSettings = inject(SiteSettingsService);
  private readonly formBuilder = inject(FormBuilder).nonNullable;
  private readonly toast = inject(ToastService);
  private readonly analytics = inject(AnalyticsService);

  readonly quoteForm = this.formBuilder.group({
    Name: ['', Validators.required],
    Phone: ['', Validators.required],
    Email: ['', [Validators.required, Validators.email]],
    Message: ['', Validators.required],
    ...enquiryControls(),
  }, { validators: sourceDetailRequiredValidator });
  readonly sourceOptions = ENQUIRY_SOURCE_OPTIONS;
  readonly sourceRequiresDetail = sourceRequiresDetail;
  private readonly changeDetector = inject(ChangeDetectorRef);
  submitted = false;
  isLoading = false;

  readonly selectedProduct = signal('');

  ngOnDestroy(): void {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
  }

  onOverlayClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('qm-overlay')) this.onClose();
  }

  onClose(): void {
    this.closeModal.emit();
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    if (!this.isOpen) return;
    event.preventDefault();
    this.onClose();
  }

  async onSubmit(): Promise<void> {
    if (this.isLoading) return;
    this.submitted = true;
    if (this.quoteForm.invalid) return;
    this.isLoading = true;
    try {
      const response = await fetch('/api/quote-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...enquiryPayload(this.quoteForm.getRawValue()),
          Type: 'Product Quote Request',
          Product: this.selectedProduct() || 'Product enquiry',
        })
      });
      if (response.ok) {
        this.analytics.trackMetaLead();
        this.quoteForm.reset();
        this.submitted = false;
        this.isLoading = false;
        this.selectedProduct.set('');
        this.toast.showToast({ message: "Quote request sent! We'll be in touch soon.", type: 'success' });
        this.onClose();
      } else {
        throw new Error('Failed');
      }
    } catch {
      this.isLoading = false;
      this.toast.showToast({ message: `Send failed — email us at ${this.siteSettings.settings().contact.email}`, type: 'error' });
    } finally {
      this.changeDetector.markForCheck();
    }
  }

  private restoreFocus(): void {
    const target = this.restoreFocusTarget;
    this.restoreFocusTarget = null;
    queueMicrotask(() => target?.focus());
  }
}
