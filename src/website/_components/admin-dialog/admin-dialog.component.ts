import { DOCUMENT } from '@angular/common';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, OnChanges, OnDestroy, computed, inject, input, output } from '@angular/core';

interface BodyScrollLock {
  count: number;
  overflow: string;
  priority: string;
}

const bodyScrollLocks = new WeakMap<Document, BodyScrollLock>();
let nextDialogId = 0;

@Component({
  selector: 'website-admin-dialog',
  standalone: true,
  imports: [CdkTrapFocus],
  templateUrl: './admin-dialog.component.html',
  styleUrl: './admin-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDialogComponent implements OnChanges, OnDestroy {
  readonly open = input(false);
  readonly title = input.required<string>();
  readonly description = input('');
  readonly busy = input(false);
  readonly closeDisabled = input(false);
  readonly closed = output<void>();
  readonly dismissDisabled = computed(() => this.busy() || this.closeDisabled());
  readonly titleId = `admin-dialog-${nextDialogId++}-title`;
  readonly descriptionId = `${this.titleId}-description`;
  private readonly document = inject(DOCUMENT);
  private scrollLocked = false;

  ngOnChanges(): void {
    if (this.open() && !this.scrollLocked) {
      const body = this.document.body;
      if (!body) return;
      const lock = bodyScrollLocks.get(this.document) ?? {
        count: 0,
        overflow: body.style.getPropertyValue('overflow'),
        priority: body.style.getPropertyPriority('overflow'),
      };
      lock.count++;
      bodyScrollLocks.set(this.document, lock);
      body.style.setProperty('overflow', 'hidden');
      this.scrollLocked = true;
    } else if (!this.open()) {
      this.releaseScrollLock();
    }
  }

  ngOnDestroy(): void {
    this.releaseScrollLock();
  }

  requestClose(): void {
    if (this.open() && !this.dismissDisabled()) this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.requestClose();
  }

  onEscape(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.requestClose();
  }

  private releaseScrollLock(): void {
    if (!this.scrollLocked) return;
    this.scrollLocked = false;
    const lock = bodyScrollLocks.get(this.document);
    if (!lock || --lock.count > 0) return;
    const style = this.document.body.style;
    if (lock.overflow) style.setProperty('overflow', lock.overflow, lock.priority);
    else style.removeProperty('overflow');
    bodyScrollLocks.delete(this.document);
  }
}
