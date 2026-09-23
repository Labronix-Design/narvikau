import { bootstrapApplication, provideClientHydration } from '@angular/platform-browser';
import { WebsiteComponent } from './website/website.component';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { websiteRoutes } from './website/website.routes';
import { provideZoneChangeDetection } from '@angular/core';
import { IMAGE_LOADER, ImageLoader, ImageLoaderConfig } from '@angular/common';

const netlifyImageLoader: ImageLoader = (config: ImageLoaderConfig) => {
  const src = config.src;
  // Pass through external URLs and SVGs unchanged; only transform raster assets.
  if (src.startsWith('http') || src.endsWith('.svg')) return src;
  const abs = `${window.location.origin}/${src.replace(/^\//, '')}`;
  const params = [`url=${encodeURIComponent(abs)}`];
  if (config.width) params.push(`w=${config.width}`);
  return `/.netlify/images?${params.join('&')}`;
};

bootstrapApplication(WebsiteComponent, {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(withFetch()),
    provideRouter(websiteRoutes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideClientHydration(),
    { provide: IMAGE_LOADER, useValue: netlifyImageLoader },
  ]
}).catch((err) => console.error("Bootstrap Error:", err));