import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule } from '@angular/router';
import { SiteSettingsService } from '../../_services/site-settings.service';

@Component({
  selector: 'website-footer',
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule
  ]
})
export class FooterComponent {
  currentYear: number = new Date().getFullYear();
  siteSettings = inject(SiteSettingsService);
}