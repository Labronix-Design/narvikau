import { Component, OnInit, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ButtonComponent } from '../../_components/button/button.component';
import { SiteSettingsService } from '../../_services/site-settings.service';

@Component({
  selector: 'website-privacy-notice',
  templateUrl: './privacy-notice.component.html',
  styleUrls: ['./privacy-notice.component.scss'],
  standalone: true, 
  imports: [
    CommonModule,
    MatIconModule,
    RouterModule,
    ButtonComponent
  ]
})
export class PrivacyNoticePage implements OnInit {
  siteSettings = inject(SiteSettingsService);
  ngOnInit(): void {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}