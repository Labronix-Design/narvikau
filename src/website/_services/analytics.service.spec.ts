import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { of } from 'rxjs';
import { Subject } from 'rxjs';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let document: Document;
  let http: jasmine.SpyObj<HttpClient>;
  let service: AnalyticsService;

  beforeEach(() => {
    localStorage.clear();
    document = window.document;
    document.head.querySelectorAll('[data-navrik-analytics]').forEach(node => node.remove());
    (window as Window & { gtag?: jasmine.Spy }).gtag = jasmine.createSpy('gtag');
    http = jasmine.createSpyObj<HttpClient>('HttpClient', ['get']);

    TestBed.configureTestingModule({
      providers: [
        AnalyticsService,
        { provide: HttpClient, useValue: http },
        { provide: DOCUMENT, useValue: document },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });
    service = TestBed.inject(AnalyticsService);
  });

  it('does not load the configuration until analytics consent is granted', async () => {
    service.trackPageView('/products');

    expect(http.get).not.toHaveBeenCalled();
  });

  it('loads a configured measurement id only after consent is granted', async () => {
    http.get.and.returnValue(of({ enabled: true, measurementId: 'G-ABCD1234' }));

    await service.grant();

    expect(http.get).toHaveBeenCalledWith('/api/public-analytics-config');
    expect(document.head.querySelector<HTMLScriptElement>('[data-navrik-analytics]')?.src)
      .toContain('https://www.googletagmanager.com/gtag/js?id=G-ABCD1234');
  });

  it('never records an admin route', async () => {
    http.get.and.returnValue(of({ enabled: true, measurementId: 'G-ABCD1234' }));
    await service.grant();
    const gtag = (window as Window & { gtag?: jasmine.Spy }).gtag as jasmine.Spy;
    gtag.calls.reset();

    await service.trackPageView('/admin/overview');

    expect(gtag).not.toHaveBeenCalledWith('event', 'page_view', jasmine.any(Object));
  });

  it('does not load the tag when consent is granted on an admin route', async () => {
    history.pushState({}, '', '/admin/overview');
    http.get.and.returnValue(of({ enabled: true, measurementId: 'G-ABCD1234' }));

    await service.grant();

    expect(http.get).not.toHaveBeenCalled();
    history.pushState({}, '', '/');
  });

  it('does not install a delayed configuration response after navigating to admin', async () => {
    history.pushState({}, '', '/products');
    const response = new Subject<{ enabled: boolean; measurementId: string | null }>();
    http.get.and.returnValue(response.asObservable());

    const granting = service.grant();
    history.pushState({}, '', '/admin/overview');
    response.next({ enabled: true, measurementId: 'G-ABCD1234' });
    response.complete();
    await granting;

    expect(document.head.querySelector('[data-navrik-analytics]')).toBeNull();
    history.pushState({}, '', '/');
  });
});
