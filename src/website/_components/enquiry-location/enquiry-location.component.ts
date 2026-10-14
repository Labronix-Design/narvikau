import { ChangeDetectionStrategy, Component, computed, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { AU_STATES_AND_TERRITORIES, EnquiryLocationSelection, locationForSubmission } from '../../_models/enquiry-location.models';

@Component({
  selector: 'website-enquiry-location',
  standalone: true,
  imports: [],
  templateUrl: './enquiry-location.component.html',
  styleUrl: './enquiry-location.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => EnquiryLocationComponent), multi: true }],
})
export class EnquiryLocationComponent implements ControlValueAccessor {
  private static nextId = 0;
  readonly id = `enquiry-location-${EnquiryLocationComponent.nextId++}`;
  readonly submitted = input(false);
  readonly states = AU_STATES_AND_TERRITORIES;
  readonly state = signal('');
  readonly suburb = signal('');
  readonly disabled = signal(false);
  readonly touched = signal(false);
  readonly showErrors = computed(() => this.touched() || this.submitted());
  readonly stateInvalid = computed(() => !AU_STATES_AND_TERRITORIES.includes(this.state()));
  readonly suburbInvalid = computed(() => {
    const suburb = this.suburb().trim();
    return !suburb || suburb.length > 160 || /[\u0000-\u001F\u007F]/.test(suburb);
  });
  private onChange: (value: EnquiryLocationSelection | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: EnquiryLocationSelection | null): void {
    this.state.set(value?.state ?? '');
    this.suburb.set(value?.suburb ?? '');
    if (!value) this.touched.set(false);
  }

  registerOnChange(fn: (value: EnquiryLocationSelection | null) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(disabled: boolean): void { this.disabled.set(disabled); }

  markTouched(): void {
    this.touched.set(true);
    this.onTouched();
  }

  updateState(event: Event): void {
    this.state.set((event.target as HTMLSelectElement).value);
    this.emitSelection();
  }

  updateSuburb(event: Event): void {
    this.suburb.set((event.target as HTMLInputElement).value);
    this.emitSelection();
  }

  private emitSelection(): void {
    this.onChange(locationForSubmission({
      state: this.state(),
      suburb: this.suburb(),
    }));
  }
}
