import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { AdminService } from '../../_services/admin.service';
import { ConfirmModalComponent } from '../../_components/confirm-modal/confirm-modal.component';

@Component({
  selector: 'website-admin-shell',
  templateUrl: './admin-shell.component.html',
  styleUrls: ['./admin-shell.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule, RouterOutlet, MatIconModule, ConfirmModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminShellComponent {
  private router = inject(Router);
  private adminService = inject(AdminService);
  private destroyRef = inject(DestroyRef);

  sidebarOpen = signal(false);
  private expandedSectionIds = signal<ReadonlySet<string>>(new Set());

  readonly navSections = [
    {
      id: 'business-control',
      label: 'Business control',
      items: [
        { label: 'Overview', icon: 'space_dashboard', path: '/admin/overview' },
        { label: 'Search & website traffic', icon: 'search', path: '/admin/search-visibility' },
        { label: 'Reporting', icon: 'summarize', path: '/admin/reports' },
      ],
    },
    {
      id: 'operations',
      label: 'Operations',
      items: [
        { label: 'Warranty registrations', icon: 'verified_user', path: '/admin/warranties' },
        { label: 'Customer enquiries', icon: 'forum', path: '/admin/queries' },
        { label: 'Analytics', icon: 'bar_chart', path: '/admin/analytics' },
      ],
    },
    {
      id: 'catalog',
      label: 'Canopy catalogue',
      items: [
        { label: 'Canopies', icon: 'inventory_2', path: '/admin/products' },
      ],
    },
    {
      id: 'content',
      label: 'Content',
      items: [
        { label: 'Site Settings', icon: 'tune',            path: '/admin/settings'        },
        { label: 'Legal Pages',   icon: 'gavel',            path: '/admin/legal-pages'     },
      ],
    },
  ];

  constructor() {
    this.openActiveSection();
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => this.openActiveSection());
  }

  toggleSidebar(): void {
    this.sidebarOpen.update(v => !v);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  toggleSection(sectionId: string): void {
    this.expandedSectionIds.update(expanded => {
      const next = new Set(expanded);
      next.has(sectionId) ? next.delete(sectionId) : next.add(sectionId);
      return next;
    });
  }

  isSectionExpanded(sectionId: string): boolean {
    return this.expandedSectionIds().has(sectionId);
  }

  isActive(path: string): boolean {
    return this.router.url.startsWith(path);
  }

  isSectionActive(section: typeof this.navSections[number]): boolean {
    return section.items.some(item => this.isActive(item.path));
  }

  logout(): void {
    this.adminService.logout();
    this.router.navigate(['/admin/login']);
  }

  private openActiveSection(): void {
    const active = this.navSections.find(section => this.isSectionActive(section));
    if (!active) return;

    this.expandedSectionIds.update(expanded => new Set([...expanded, active.id]));
  }
}
