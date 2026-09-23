import { CommonModule } from '@angular/common';
import { Component, Input, Self, Optional } from '@angular/core';
import { ControlValueAccessor, FormControl, NgControl, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'website-text-input',
  templateUrl: './text-input.component.html',
  styleUrls: ['./text-input.component.scss'],
  standalone: true,
  imports: [
    CommonModule, 
    ReactiveFormsModule, 
    MatIconModule
  ]
})
export class TextInputComponent implements ControlValueAccessor {
  @Input() id: string = `input-${Math.random().toString(36).substring(2, 9)}`;
  @Input() label: string = '';
  @Input() type: string = 'text';
  @Input() submitted: boolean = false;
  @Input() placeholder: string = '';
  @Input() autocomplete: string = 'on';

  onChange: (value: any) => void = () => {};
  onTouched: () => void = () => {};

  constructor(@Optional() @Self() public ngControl: NgControl) {
    if (this.ngControl) {
      this.ngControl.valueAccessor = this;
    }
  }

  get formControl(): FormControl | null {
    return this.ngControl?.control as FormControl | null;
  }

  get isRequired(): boolean {
    const validator = this.formControl?.validator ? this.formControl.validator({} as any) : null;
    return !!(validator && validator['required']);
  }

  get hasValue(): boolean {
    const val = this.formControl?.value;
    return val !== null && val !== undefined && val !== '';
  }

  writeValue(value: any): void {}
  registerOnChange(fn: any): void { this.onChange = fn; }
  registerOnTouched(fn: any): void { this.onTouched = fn; }
}