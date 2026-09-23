import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { AnalyticsService } from './analytics.service';

export interface Review {
  author_name: string;
  rating: number;
  relative_time_description: string;
  text: string;
  profile_photo_url?: string;
}

export interface GoogleReviewsResponse {
  name: string;
  overallRating: number;
  reviews: Review[];
}

@Injectable({
  providedIn: 'root'
})
export class GoogleReviewsService {
  private analytics = inject(AnalyticsService);
  private platformId = inject(PLATFORM_ID);

  private readonly MOCK_DATA: GoogleReviewsResponse = {
    name: "navrik",
    overallRating: 5.0,
    reviews: [
      {
        author_name: "Mariza Van Noordwyk",
        rating: 5,
        relative_time_description: "a month ago",        
        text: "Great logo and web design. Professional and great service. Can recommend 👌",
        profile_photo_url: 'assets/loayalty-card-logos/reviews/mariza.png'
      },
      {
        author_name: "Pieter van Dyk",
        rating: 5,
        relative_time_description: "a month ago",
        text: "navrik team, are young, vibrant and provides fresh new look on everything virtual... My Hat goes off to them ! winning team....",
        profile_photo_url: 'assets/loayalty-card-logos/reviews/pieter.png'
      }
    ]
  };

  /** --- TELEMETRY --- */
  private track(eventName: string, params: Record<string, unknown> = {}): void {
    void this.analytics.trackEvent(eventName, params);
  }

  trackPageChange(url: string): void {
    void this.analytics.trackPageView(url);
  }

  trackButtonClick(label: string, context: string = 'general') { 
    this.track('cta_click', {
      button_label: label.toUpperCase(),
      context
    });
  }

  trackEvent(name: string, params: Record<string, unknown> = {}) {
    this.track(name, params);
  }

  trackSystemError(category: string, message: string) {
    this.track('system_error', {
      error_category: category,
      error_message: message,
      page_path: isPlatformBrowser(this.platformId) ? window.location.pathname : 'server',
    });
  }

  getReviews(): Observable<GoogleReviewsResponse> {
    return of(this.MOCK_DATA).pipe(delay(500));
  }
}
