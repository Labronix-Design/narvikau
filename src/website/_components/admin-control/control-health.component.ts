import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

export type ControlHealthState = 'ready' | 'attention' | 'action-required' | 'not-measured';

const HEALTH_META: Record<ControlHealthState, { label: string; icon: string }> = {
  ready: { label: 'Ready', icon: 'check_circle' },
  attention: { label: 'Needs attention', icon: 'error_outline' },
  'action-required': { label: 'Action required', icon: 'error' },
  'not-measured': { label: 'Not measured', icon: 'help_outline' },
};

@Component({
  selector: 'website-control-health',
  standalone: true,
  imports: [MatIconModule, MatTooltipModule],
  templateUrl: './control-health.component.html',
  styleUrl: './control-health.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ControlHealthComponent {
  readonly state = input<ControlHealthState>('not-measured');
  readonly detail = input('');

  protected readonly metaFor = (state: ControlHealthState) => HEALTH_META[state];
}
