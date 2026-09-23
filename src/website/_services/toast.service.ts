import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ToastConfig {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  position?: string;
  duration?: number;
  id?: number; // Unique ID for tracking
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private toasts: ToastConfig[] = [];
  private toastSubject = new BehaviorSubject<ToastConfig[]>([]);
  private autoIncrementId = 0;
  
  // Store active timers here, not on the config object
  private timers = new Map<number, any>();

  showToast(config: ToastConfig): void {
    const id = this.autoIncrementId++;
    const toast: ToastConfig = { 
      position: 'top', // Matches your SCSS 'top: 90px'
      duration: 3000, 
      ...config, 
      id 
    };

    this.toasts.push(toast);
    this.toastSubject.next([...this.toasts]);

    this.startTimer(toast);
  }

  removeToast(id: number | undefined): void {
    if (id === undefined) return;
    
    // Cleanup timer
    if (this.timers.has(id)) {
      clearTimeout(this.timers.get(id));
      this.timers.delete(id);
    }

    this.toasts = this.toasts.filter(t => t.id !== id);
    this.toastSubject.next([...this.toasts]);
  }

  // --- COMPONENT CONTROLS ---

  pauseTimer(id: number | undefined): void {
    if (id !== undefined && this.timers.has(id)) {
      clearTimeout(this.timers.get(id));
      this.timers.delete(id);
    }
  }

  resumeTimer(toast: ToastConfig): void {
    if (toast.id !== undefined) {
      // User requested 300000ms (5 mins) resume duration in previous code
      this.startTimer(toast, 300000); 
    }
  }

  getToasts() {
    return this.toastSubject.asObservable();
  }

  private startTimer(toast: ToastConfig, durationOverride?: number): void {
    if (toast.duration === 0) return; // 0 = persistent
    
    const ms = durationOverride || toast.duration || 3000;
    const timerId = setTimeout(() => {
      this.removeToast(toast.id);
    }, ms);
    
    if (toast.id !== undefined) {
      this.timers.set(toast.id, timerId);
    }
  }
}