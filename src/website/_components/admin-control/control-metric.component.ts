import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';

export type ControlMetricFormat = 'number' | 'currency' | 'percent' | 'text';
export type ControlMetricTone = 'default' | 'accent' | 'success' | 'warning';

@Component({
  selector: 'website-control-metric',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule, RouterLink],
  templateUrl: './control-metric.component.html',
  styleUrl: './control-metric.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ControlMetricComponent {
  readonly label = input.required<string>();
  readonly icon = input<string>('');
  // Endpoint data is external input. Keep this deliberately broad so an
  // unexpected object can be represented safely instead of leaking as
  // "[object Object]" into an administrator's dashboard.
  readonly value = input<unknown>(null);
  readonly format = input<ControlMetricFormat>('number');
  readonly context = input<string>('');
  readonly trend = input<string>('');
  readonly unavailableReason = input<string>('This measurement is not available from the connected data source.');
  readonly tone = input<ControlMetricTone>('default');
  readonly routerLink = input<string | null>(null);

  readonly formattedValue = computed(() => {
    const value = this.value();
    if (value === null || value === undefined || value === '') return 'Not measured yet';
    if (typeof value === 'string') return value;
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'Not measured yet';
    if (this.format() === 'text') return new Intl.NumberFormat('en-ZA').format(value);

    switch (this.format()) {
      case 'currency':
        return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value / 100);
      case 'percent':
        return `${new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 1 }).format(value)}%`;
      default:
        return new Intl.NumberFormat('en-ZA').format(value);
    }
  });

  readonly tooltip = computed(() => this.value() === null ? this.unavailableReason() : this.context());
}
