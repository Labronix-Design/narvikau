import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminDataTableComponent } from './admin-data-table.component';
import { AdminTableColumn } from './admin-data-table.models';

interface Row { id: number; name: string; total: number; }
const columns: AdminTableColumn<Row>[] = [
  { id: 'name', label: 'Name', value: row => row.name, sortValue: row => row.name, required: true },
  { id: 'total', label: 'Total', value: row => row.total, sortValue: row => row.total, allowBold: true },
  { id: 'id', label: 'ID', value: row => row.id, defaultVisible: false, allowBold: false },
];
const key = 'navrik-au:admin-table:spec:v1';

describe('AdminDataTableComponent', () => {
  let fixture: ComponentFixture<AdminDataTableComponent<Row>>;
  const rows: Row[] = [{ id: 1, name: 'Zulu', total: 4 }, { id: 2, name: 'Alpha', total: 2 }, { id: 3, name: 'Beta', total: 2 }];
  function create(preferences?: string) {
    localStorage.removeItem(key);
    if (preferences) localStorage.setItem(key, preferences);
    fixture = TestBed.createComponent(AdminDataTableComponent<Row>);
    fixture.componentRef.setInput('tableId', 'spec');
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('rowId', (row: Row) => row.id);
    fixture.detectChanges();
  }
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AdminDataTableComponent] }).compileComponents();
  });
  afterEach(() => localStorage.removeItem(key));

  it('toggles stable sorting without changing the source row order', () => {
    create();
    const component = fixture.componentInstance;
    expect(component.sortedRows().map(row => row.id)).toEqual([1, 2, 3]);
    component.sortBy('total');
    expect(component.sortedRows().map(row => row.id)).toEqual([2, 3, 1]);
    component.sortBy('total');
    expect(component.sortedRows().map(row => row.id)).toEqual([1, 2, 3]);
    expect(rows.map(row => row.id)).toEqual([1, 2, 3]);
  });

  it('keeps required columns visible and ignores unknown column IDs', () => {
    create();
    fixture.componentInstance.toggleColumn('name');
    fixture.componentInstance.toggleColumn('unknown');
    expect(fixture.componentInstance.visibleColumns().map(column => column.id)).toEqual(['name', 'total']);
  });

  it('restores valid preferences and persists only eligible column IDs', () => {
    create(JSON.stringify({ version: 1, visibleColumnIds: ['id', 'removed'], boldColumnIds: ['total', 'id', 'removed'] }));
    expect(fixture.componentInstance.visibleColumns().map(column => column.id)).toEqual(['name', 'id']);
    expect(fixture.componentInstance.isBold('total')).toBeTrue();
    expect(fixture.componentInstance.isBold('id')).toBeFalse();
    fixture.componentInstance.toggleColumn('total');
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ version: 1, visibleColumnIds: ['total', 'id'], boldColumnIds: ['total'] });
  });

  for (const preferences of ['broken', '{"version":2}', '{"version":1,"visibleColumnIds":["removed"],"boldColumnIds":[]}', '{"version":1,"visibleColumnIds":{},"boldColumnIds":[]}']) {
    it(`recovers defaults from malformed or stale preferences: ${preferences}`, () => {
      create(preferences);
      expect(fixture.componentInstance.visibleColumns().map(column => column.id)).toEqual(['name', 'total']);
    });
  }

  it('bolds eligible values and reflects sort direction in accessible headers', () => {
    create();
    const component = fixture.componentInstance;
    component.toggleBold('total');
    component.toggleBold('id');
    component.sortBy('total');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('th[data-column="total"]').getAttribute('aria-sort')).toBe('ascending');
    expect(fixture.nativeElement.querySelector('td[data-column="total"]').classList.contains('is-bold')).toBeTrue();
    expect(component.isBold('id')).toBeFalse();
    component.sortBy('total');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('th[data-column="total"]').getAttribute('aria-sort')).toBe('descending');
  });
});
