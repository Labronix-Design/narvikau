import { ChangeDetectionStrategy, Component, DOCUMENT, Input, OnChanges, PLATFORM_ID, SimpleChanges, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'website-image',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="shimmer-wrapper"
      [class.is-loading]="!isLoaded()"
      [style.aspect-ratio]="aspectRatio || null">
      <span class="loading-label" [class.hidden]="isLoaded()">Loading…</span>
      <img
        [src]="resolvedSrc()"
        [attr.srcset]="responsiveSrcSet()"
        [attr.sizes]="responsiveSrcSet() ? sizes : null"
        [alt]="alt"
        [class]="imgClass"
        [attr.loading]="priority ? 'eager' : 'lazy'"
        [attr.fetchpriority]="priority ? 'high' : null"
        [style.object-fit]="objectFit"
        [style.filter]="filter || null"
        decoding="async"
        (load)="onLoad()"
        [style.opacity]="isLoaded() ? 1 : 0">
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      border-radius: inherit;
    }

    .shimmer-wrapper {
      width: 100%;
      height: 100%;
      position: relative;
      overflow: hidden;
      border-radius: inherit;
      min-height: 40px;
      background:
        linear-gradient(135deg,
          #8e8e8e 0%,
          #b8b8b8 20%,
          #d4d4d4 35%,
          #c0c0c0 50%,
          #b0b0b0 65%,
          #c8c8c8 80%,
          #9a9a9a 100%
        );
      transition: opacity 0.3s ease;
    }

    .shimmer-wrapper.is-loading {
      background-image:
        linear-gradient(
          90deg,
          transparent           0%,
          rgba(255,255,255,0)   30%,
          rgba(255,255,255,0.5) 50%,
          rgba(255,255,255,0)   70%,
          transparent           100%
        ),
        linear-gradient(135deg,
          #8e8e8e 0%,
          #b8b8b8 20%,
          #d4d4d4 35%,
          #c0c0c0 50%,
          #b0b0b0 65%,
          #c8c8c8 80%,
          #9a9a9a 100%
        );
      background-size: 200% 100%, 100% 100%;
      animation: aluminiumShimmer 1.6s ease-in-out infinite;
    }

    @keyframes aluminiumShimmer {
      0%   { background-position: -200% 0, 0 0; }
      100% { background-position:  200% 0, 0 0; }
    }

    .loading-label {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #4a4a4a;
      pointer-events: none;
      user-select: none;
      z-index: 1;
      transition: opacity 0.3s ease;
    }

    .loading-label.hidden {
      opacity: 0;
    }

    img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
      object-position: center;
      transition: opacity 0.5s cubic-bezier(0.25, 0.8, 0.25, 1);
      user-select: none;
      pointer-events: none;
    }
  `]
})
export class ImageLoaderComponent implements OnChanges {
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);

  @Input({ required: true }) src!: string;
  @Input() alt = '';
  @Input() imgClass = '';
  @Input() priority = false;
  /** Creates a `<link rel="preload">` only for a verified static image. */
  @Input() preload = false;
  @Input() objectFit = 'cover';
  @Input() filter = '';
  /** CSS aspect-ratio value e.g. '16/9', '1/1'. Prevents container collapse before image loads. */
  @Input() aspectRatio = '';
  /** Rendered width hint for responsive CDN variants; cards must not download a hero-sized image. */
  @Input() sizes = '(max-width: 48rem) 100vw, min(50vw, 56rem)';

  isLoaded = signal(false);
  readonly resolvedSrc = signal('');
  readonly responsiveSrcSet = signal<string | null>(null);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['src']) {
      this.isLoaded.set(false);
      this.setResponsiveSource();
    }
    this.preloadStablePriorityAsset();
  }

  onLoad(): void {
    this.isLoaded.set(true);
  }

  /**
   * Administrator uploads can be much larger than their rendered hero slot.
   * Netlify Image CDN creates responsive variants without changing the stored
   * source of truth or requiring a second client-managed image record.
   */
  private setResponsiveSource(): void {
    this.resolvedSrc.set(this.src);
    this.responsiveSrcSet.set(null);
    if (!isPlatformBrowser(this.platformId)) return;

    const absoluteSource = new URL(this.src, this.document.baseURI);
    const isLocalUpload = absoluteSource.origin === this.document.location.origin
      && absoluteSource.pathname.startsWith('/uploads/');
    if (!isLocalUpload) return;

    const variant = (width: number) => `/.netlify/images?url=${encodeURIComponent(absoluteSource.href)}&w=${width}`;
    this.resolvedSrc.set(variant(1440));
    this.responsiveSrcSet.set([
      `${variant(640)} 640w`,
      `${variant(960)} 960w`,
      `${variant(1440)} 1440w`,
      `${variant(1920)} 1920w`,
    ].join(', '));
  }

  /**
   * The homepage may replace its fallback art with an administrator-selected
   * image. Only an explicit local fallback marked as priority is safe to
   * preload; preloading a remote or administrator-selected URL would compete
   * with the eventual LCP image instead of improving it.
   */
  private preloadStablePriorityAsset(): void {
    if (!isPlatformBrowser(this.platformId) || !this.preload || !this.src.startsWith('assets/')) return;

    const href = new URL(this.src, this.document.baseURI).href;
    const alreadyPreloaded = Array.from(this.document.head.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="image"]'))
      .some(link => link.href === href);
    if (alreadyPreloaded) return;

    const preload = this.document.createElement('link');
    preload.rel = 'preload';
    preload.as = 'image';
    preload.href = this.src;
    preload.fetchPriority = 'high';
    this.document.head.appendChild(preload);
  }
}
