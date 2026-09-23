import {
  afterNextRender,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter } from 'rxjs/operators';
import { SiteSettingsService } from '../../_services/site-settings.service';

@Component({
  selector: 'website-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss'],
  standalone: true,
  imports: [RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavbarComponent implements OnInit, OnDestroy {
  @ViewChild('navElement') navElement!: ElementRef<HTMLElement>;

  readonly router = inject(Router);
  readonly siteSettings = inject(SiteSettingsService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  isMenuOpen = false;
  private documentClickListener: (() => void) | null = null;

  constructor() {
    afterNextRender(() => this.setupDocumentClickListener());
  }

  ngOnInit(): void {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => {
      this.closeNavbar();
      this.ngZone.run(() => this.cdr.markForCheck());
    });
  }

  ngOnDestroy(): void {
    this.documentClickListener?.();
    document.body.style.overflow = '';
  }

  toggleNavbar(): void {
    this.isMenuOpen = !this.isMenuOpen;
    document.body.style.overflow = this.isMenuOpen ? 'hidden' : '';
    this.cdr.markForCheck();
  }

  closeNavbar(): void {
    if (!this.isMenuOpen) return;
    this.isMenuOpen = false;
    document.body.style.overflow = '';
    this.cdr.markForCheck();
  }

  private setupDocumentClickListener(): void {
    const onClick = (event: MouseEvent) => {
      if (this.isMenuOpen && this.navElement && !this.navElement.nativeElement.contains(event.target as Node)) {
        this.ngZone.run(() => this.closeNavbar());
      }
    };
    document.addEventListener('click', onClick);
    this.documentClickListener = () => document.removeEventListener('click', onClick);
  }
}
