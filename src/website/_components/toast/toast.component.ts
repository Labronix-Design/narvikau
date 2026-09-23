import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ToastService, ToastConfig } from '../../_services/toast.service';

@Component({
  selector: 'website-toast',
  templateUrl: './toast.component.html',
  styleUrls: ['./toast.component.scss'], // Keeping your file reference
  standalone: true, 
  imports: [CommonModule, MatIconModule]
})
export class ToastComponent implements OnInit {
  private toastService = inject(ToastService);
  toasts: ToastConfig[] = [];

  ngOnInit(): void {
    this.toastService.getToasts().subscribe((toasts) => {
      this.toasts = toasts;
    });
  }

  closeToast(toast: ToastConfig): void {
    this.toastService.removeToast(toast.id);
  }

  pauseToast(toast: ToastConfig): void {
    this.toastService.pauseTimer(toast.id);
  }

  resumeToast(toast: ToastConfig): void {
    this.toastService.resumeTimer(toast);
  }
}