export type AdminTableValue = string | number | boolean | Date | null | undefined;

export interface AdminTableColumn<T> {
  readonly id: string;
  readonly label: string;
  readonly value: (row: T) => AdminTableValue;
  readonly sortValue?: (row: T) => AdminTableValue;
  readonly defaultVisible?: boolean;
  readonly required?: boolean;
  /** Lower values appear first in the mobile card; desktop keeps declaration order. */
  readonly mobilePriority?: number;
  readonly allowBold?: boolean;
}

export interface AdminTableRowContext<T> {
  readonly $implicit: T;
  readonly row: T;
  readonly index: number;
}

export interface AdminTableCellContext<T> extends AdminTableRowContext<T> {
  readonly column: AdminTableColumn<T>;
}

export interface AdminTablePreferences {
  readonly version: 1;
  readonly visibleColumnIds: readonly string[];
  readonly boldColumnIds: readonly string[];
}
