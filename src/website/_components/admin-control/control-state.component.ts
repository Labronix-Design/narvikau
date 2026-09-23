import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type ControlState = 'loading' | 'setup' | 'empty' | 'error';

@Component({
  selector: 'website-control-state',
  standalone: true,
  templateUrl: './control-state.component.html',
  styleUrl: './control-state.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ControlStateComponent {
  readonly state = input<ControlState>('loading');
  readonly title = input('Loading your business view');
  readonly message = input('');
  readonly skeletonCount = input(4);
}
