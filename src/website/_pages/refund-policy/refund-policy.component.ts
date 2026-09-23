import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { SiteSettingsService } from '../../_services/site-settings.service';
import { LegalPageService } from '../../_services/legal-page.service';
import { LegalPageContent, DEFAULT_REFUND_POLICY } from '../../_models/legal-page.models';

@Component({
  selector: 'website-refund-policy',
  templateUrl: './refund-policy.component.html',
  styleUrls: ['./refund-policy.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RefundPolicyPage implements OnInit {
  siteSettings = inject(SiteSettingsService);
  readonly legalPageService = inject(LegalPageService);

  content = signal<LegalPageContent>(DEFAULT_REFUND_POLICY);

  async ngOnInit(): Promise<void> {
    window.scrollTo({ top: 0, behavior: 'instant' });
    const content = await this.legalPageService.load('refund');
    if (content) this.content.set(content);
  }
}
