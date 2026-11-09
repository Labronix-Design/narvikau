import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, Directive, OnChanges, TemplateRef,
  computed, contentChild, contentChildren, inject, input, signal,
} from '@angular/core';
import type { AdminTableCellContext, AdminTableColumn, AdminTablePreferences, AdminTableRowContext, AdminTableValue } from './admin-data-table.models';

@Directive({ selector: 'ng-template[adminTableCell]', standalone: true })
export class AdminTableCellDirective<T> {
  readonly columnId = input.required<string>({ alias: 'adminTableCell' });
  readonly template = inject<TemplateRef<AdminTableCellContext<T>>>(TemplateRef);
}

@Directive({ selector: 'ng-template[adminTableActions]', standalone: true })
export class AdminTableActionsDirective<T> {
  readonly template = inject<TemplateRef<AdminTableRowContext<T>>>(TemplateRef);
}

@Directive({ selector: 'ng-template[adminTableExpanded]', standalone: true })
export class AdminTableExpandedDirective<T> {
  readonly template = inject<TemplateRef<AdminTableRowContext<T>>>(TemplateRef);
}

@Component({
  selector: 'website-admin-data-table',
  standalone: true,
  imports: [NgTemplateOutlet],
  templateUrl: './admin-data-table.component.html',
  styleUrl: './admin-data-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDataTableComponent<T> implements OnChanges {
  readonly tableId = input.required<string>();
  readonly rows = input<readonly T[]>([]);
  readonly columns = input.required<readonly AdminTableColumn<T>[]>();
  readonly rowId = input.required<(row: T) => string | number>();
  readonly caption = input('Records');
  readonly emptyMessage = input('No records found.');
  readonly rowExpanded = input<(row: T) => boolean>(() => true);
  readonly cellTemplates = contentChildren<AdminTableCellDirective<T>>(AdminTableCellDirective);
  readonly actionsTemplate = contentChild<AdminTableActionsDirective<T>>(AdminTableActionsDirective);
  readonly expandedTemplate = contentChild<AdminTableExpandedDirective<T>>(AdminTableExpandedDirective);
  readonly sort = signal<{ id: string; direction: 'ascending' | 'descending' } | null>(null);
  readonly optionsOpen = signal(false);
  private resizeStart: { id: string; x: number; width: number } | null = null;
  private readonly document = inject(DOCUMENT);
  private readonly preferences = signal<AdminTablePreferences>({ version: 2, visibleColumnIds: [], boldColumnIds: [], columnWidths: {} });
  private loadedTableId: string | null = null;

  readonly visibleColumns = computed(() => {
    const visible = new Set(this.preferences().visibleColumnIds);
    return this.columns().filter(column => column.required || visible.has(column.id));
  });

  readonly sortedRows = computed(() => {
    const sort = this.sort();
    const column = this.columns().find(column => column.id === sort?.id);
    if (!sort || !column?.sortValue) return [...this.rows()];
    const sortValue = column.sortValue;
    const direction = sort.direction === 'ascending' ? 1 : -1;
    return this.rows().map((row, index) => ({ row, index, value: sortValue(row) }))
      .sort((left, right) => direction * this.compare(left.value, right.value) || left.index - right.index)
      .map(entry => entry.row);
  });

  ngOnChanges(): void {
    const id = this.tableId();
    if (id !== this.loadedTableId) {
      this.loadedTableId = id;
      this.sort.set(null);
      let saved: unknown;
      try { saved = JSON.parse(this.document.defaultView?.localStorage.getItem(this.storageKey()) ?? 'null'); }
      catch { saved = null; }
      this.preferences.set(this.sanitise(saved));
    } else {
      this.preferences.set(this.sanitise(this.preferences()));
    }
  }

  isVisible(id: string): boolean {
    return this.visibleColumns().some(column => column.id === id);
  }

  isBold(id: string): boolean {
    return this.columns().some(column => column.id === id && column.allowBold !== false)
      && this.preferences().boldColumnIds.includes(id);
  }

  toggleColumn(id: string): void {
    const column = this.columns().find(column => column.id === id);
    if (!column || column.required) return;
    const selected = new Set(this.preferences().visibleColumnIds);
    selected.has(id) ? selected.delete(id) : selected.add(id);
    this.save({ ...this.preferences(), visibleColumnIds: this.columns().filter(column => !column.required && selected.has(column.id)).map(column => column.id) });
  }

  toggleBold(id: string): void {
    const column = this.columns().find(column => column.id === id);
    if (!column || column.allowBold === false) return;
    const selected = new Set(this.preferences().boldColumnIds);
    selected.has(id) ? selected.delete(id) : selected.add(id);
    this.save({ ...this.preferences(), boldColumnIds: this.columns().filter(column => column.allowBold !== false && selected.has(column.id)).map(column => column.id) });
  }

  columnWidth(id: string): string | null { const width = this.preferences().columnWidths[id]; return width ? `${width}px` : null; }
  columnWidthValue(id: string): number | '' { return this.preferences().columnWidths[id] ?? ''; }
  setColumnWidth(id: string, value: string): void {
    const width = Math.max(120, Math.min(640, Number(value) || 0));
    const widths = { ...this.preferences().columnWidths };
    if (width) widths[id] = width; else delete widths[id];
    this.save({ ...this.preferences(), columnWidths: widths });
  }
  beginResize(event: PointerEvent, id: string): void {
    if (event.pointerType === 'touch') return;
    const header = (event.currentTarget as HTMLElement).parentElement;
    this.resizeStart = { id, x: event.clientX, width: header?.getBoundingClientRect().width ?? 160 };
    this.document.defaultView?.addEventListener('pointermove', this.resizeColumn);
    this.document.defaultView?.addEventListener('pointerup', this.endResize, { once: true });
    event.preventDefault();
  }
  private readonly resizeColumn = (event: PointerEvent): void => {
    if (!this.resizeStart) return;
    this.setColumnWidth(this.resizeStart.id, String(this.resizeStart.width + event.clientX - this.resizeStart.x));
  };
  private readonly endResize = (): void => { this.resizeStart = null; this.document.defaultView?.removeEventListener('pointermove', this.resizeColumn); };

  sortBy(id: string): void {
    if (!this.columns().some(column => column.id === id && column.sortValue)) return;
    this.sort.update(sort => ({ id, direction: sort?.id === id && sort.direction === 'ascending' ? 'descending' : 'ascending' }));
  }

  ariaSort(id: string): 'ascending' | 'descending' | 'none' | null {
    if (!this.columns().some(column => column.id === id && column.sortValue)) return null;
    return this.sort()?.id === id ? this.sort()!.direction : 'none';
  }

  cellTemplate(id: string): TemplateRef<AdminTableCellContext<T>> | null {
    return this.cellTemplates().find(template => template.columnId() === id)?.template ?? null;
  }

  private storageKey(): string {
    return `navrik-au:admin-table:${this.tableId()}:v1`;
  }

  private sanitise(value: unknown): AdminTablePreferences {
    const defaults: AdminTablePreferences = {
      version: 2,
      visibleColumnIds: this.columns().filter(column => !column.required && column.defaultVisible !== false).map(column => column.id),
      boldColumnIds: [],
      columnWidths: {},
    };
    if (!value || typeof value !== 'object') return defaults;
    const saved = value as Partial<AdminTablePreferences>;
    if ((saved.version !== 1 && saved.version !== 2) || !Array.isArray(saved.visibleColumnIds) || !Array.isArray(saved.boldColumnIds)
      || !saved.visibleColumnIds.every(id => typeof id === 'string') || !saved.boldColumnIds.every(id => typeof id === 'string')) return defaults;
    const optional = this.columns().filter(column => !column.required);
    const known = saved.visibleColumnIds.filter(id => optional.some(column => column.id === id));
    // A nonempty list containing only obsolete IDs is a stale schema, not an intentional empty selection.
    if (saved.visibleColumnIds.length && !known.length) return defaults;
    return {
      version: 2,
      visibleColumnIds: optional.filter(column => known.includes(column.id)).map(column => column.id),
      boldColumnIds: this.columns().filter(column => column.allowBold !== false && saved.boldColumnIds!.includes(column.id)).map(column => column.id),
      columnWidths: Object.fromEntries(Object.entries((saved as any).columnWidths ?? {}).filter(([id, width]) => this.columns().some(column => column.id === id) && typeof width === 'number' && width >= 120 && width <= 640)) as Record<string, number>,
    };
  }

  private save(preferences: AdminTablePreferences): void {
    this.preferences.set(preferences);
    try { this.document.defaultView?.localStorage.setItem(this.storageKey(), JSON.stringify(preferences)); }
    catch { /* Browser storage may be disabled; the current table remains usable. */ }
  }

  private compare(left: AdminTableValue, right: AdminTableValue): number {
    if (left == null) return right == null ? 0 : 1;
    if (right == null) return -1;
    if (left instanceof Date && right instanceof Date) return left.getTime() - right.getTime();
    if (typeof left === 'number' && typeof right === 'number') return left - right;
    if (typeof left === 'boolean' && typeof right === 'boolean') return Number(left) - Number(right);
    return String(left).localeCompare(String(right), 'en-AU', { numeric: true, sensitivity: 'base' });
  }
}
