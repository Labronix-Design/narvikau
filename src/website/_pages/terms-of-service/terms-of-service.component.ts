import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule } from '@angular/router';
import { ButtonComponent } from '../../_components/button/button.component';
import { SiteSettingsService } from '../../_services/site-settings.service';
import { LegalPageService } from '../../_services/legal-page.service';
import { LegalPageContent, DEFAULT_TERMS_OF_SERVICE } from '../../_models/legal-page.models';

@Component({
  selector: 'website-terms-of-service',
  templateUrl: './terms-of-service.component.html',
  styleUrls: ['./terms-of-service.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    RouterModule,
    ButtonComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermsOfServicePage implements OnInit {
  siteSettings = inject(SiteSettingsService);
  readonly legalPageService = inject(LegalPageService);

  content = signal<LegalPageContent>(DEFAULT_TERMS_OF_SERVICE);

  async ngOnInit(): Promise<void> {
    window.scrollTo({ top: 0, behavior: 'instant' });
    const content = await this.legalPageService.load('terms');
    if (content) this.content.set(content);
  }
}
