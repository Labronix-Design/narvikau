import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { AnalyticsService } from '../../_services/analytics.service';

@Component({
  selector: 'website-analytics-consent',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (analytics.consent() === 'unknown' && !isAdminRoute()) {
      <aside class="consent" aria-label="Analytics preference" aria-live="polite">
        <div>
          <strong>Help us improve Navrik</strong>
          <p>May we use privacy-conscious website analytics? You can change your choice by clearing this site’s data.</p>
          <a routerLink="/privacy">Read the privacy notice</a>
        </div>
        <div class="actions">
          <button type="button" class="secondary" (click)="decline()">No thanks</button>
          <button type="button" class="primary" (click)="accept()" [disabled]="saving()">
            {{ saving() ? 'Saving…' : 'Allow analytics' }}
          </button>
        </div>
      </aside>
    }
  `,
  styleUrl: './analytics-consent.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsConsentComponent {
  readonly analytics = inject(AnalyticsService);
  readonly saving = signal(false);
  private router = inject(Router);
  readonly isAdminRoute = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(event => this.routeIsAdmin(event.urlAfterRedirects)),
    ),
    { initialValue: this.routeIsAdmin(this.router.url) },
  );

  async accept(): Promise<void> {
    this.saving.set(true);
    try {
      await this.analytics.grant();
    } finally {
      this.saving.set(false);
    }
  }

  decline(): void {
    this.analytics.deny();
  }

  private routeIsAdmin(url: string): boolean {
    const pathname = url.split(/[?#]/)[0] || '/';
    return pathname === '/admin' || pathname.startsWith('/admin/');
  }
}
