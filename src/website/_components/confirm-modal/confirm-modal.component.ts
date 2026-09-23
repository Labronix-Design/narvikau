import { Component, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ModalService } from '../../_services/modal.service';

@Component({
  selector: 'website-confirm-modal',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './confirm-modal.component.html',
  styleUrls: ['./confirm-modal.component.scss'],
})
export class ConfirmModalComponent {
  modal = inject(ModalService);

  iconFor(variant: string | undefined): string {
    if (variant === 'danger') return 'warning';
    if (variant === 'warning') return 'error';
    return 'info';
  }

  onConfirm(): void {
    this.modal.respond(true);
  }

  onCancel(): void {
    this.modal.respond(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.modal.state()) this.onCancel();
  }
}
