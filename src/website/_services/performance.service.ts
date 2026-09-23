import { Injectable, Inject, PLATFORM_ID, NgZone, inject } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class PerformanceService {
  private platformId = inject(PLATFORM_ID);
  private document = inject(DOCUMENT);
  private ngZone = inject(NgZone);
  private toast = inject(ToastService);

  private lastErrorTime = 0;
  private wasOffline = false;

  public init() {
    if (!isPlatformBrowser(this.platformId)) return;

    // Initial Check
    this.evaluateNetwork();

    // Listeners
    window.addEventListener('offline', () => this.evaluateNetwork());
    window.addEventListener('online', () => this.evaluateNetwork());
    
    // Network Information API (Chrome/Android only)
    const nav: any = window.navigator;
    if (nav.connection) {
      nav.connection.addEventListener('change', () => this.evaluateNetwork());
    }
  }

  private evaluateNetwork() {
    const nav: any = window.navigator;
    const isOnline = nav.onLine;
    const conn = nav.connection || {};
    // 'save-data' is a modern header for users who requested reduced data usage
    const saveData = conn.saveData === true; 
    const effectiveType = conn.effectiveType || '4g';

    // 1. RECOVERY
    if (isOnline && this.wasOffline) {
      this.wasOffline = false;
      this.lastErrorTime = 0;
      this.ngZone.run(() => this.toast.showToast({
        message: 'Connection restored.', type: 'success', duration: 3000
      }));
    }

    // 2. OFFLINE
    if (!isOnline) {
      this.wasOffline = true;
      const now = Date.now();
      // Debounce the error toast (5 mins)
      if (now - this.lastErrorTime > 300000) { 
        this.ngZone.run(() => this.toast.showToast({
          message: 'You are offline. Some features may be limited.', type: 'error', duration: 5000
        }));
        this.lastErrorTime = now;
      }
    }

    // 3. PERFORMANCE TIER SETTING
    // We set a data attribute on <html> to allow CSS to disable heavy animations
    let tier = 'rich';
    if (!isOnline || saveData || effectiveType === '2g' || effectiveType === '3g') {
      tier = 'eco';
    }
    
    this.document.documentElement.setAttribute('data-perf', tier);
  }
}