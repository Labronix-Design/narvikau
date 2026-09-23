import { Injectable, signal } from '@angular/core';

export type ModalVariant = 'default' | 'danger' | 'warning';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ModalVariant;
}

export interface AlertOptions {
  title: string;
  message: string;
  variant?: ModalVariant;
  okLabel?: string;
}

interface ModalState extends ConfirmOptions, AlertOptions {
  kind: 'confirm' | 'alert';
}

// Drop-in replacement for window.confirm()/window.alert() that renders as a
// themed in-app dialog instead of the browser's native (unstyleable) popup.
// One instance is mounted in AdminShellComponent; call confirm()/alert() from
// anywhere and await the result the same way you would the native versions.
@Injectable({ providedIn: 'root' })
export class ModalService {
  readonly state = signal<ModalState | null>(null);
  private resolver: ((value: boolean) => void) | null = null;

  confirm(opts: ConfirmOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.resolver = resolve;
      this.state.set({ kind: 'confirm', ...opts });
    });
  }

  alert(opts: AlertOptions): Promise<void> {
    return new Promise<void>((resolve) => {
      this.resolver = () => resolve();
      this.state.set({ kind: 'alert', ...opts });
    });
  }

  respond(result: boolean): void {
    const resolve = this.resolver;
    this.state.set(null);
    this.resolver = null;
    resolve?.(result);
  }
}
