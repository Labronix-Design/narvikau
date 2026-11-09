import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import '@angular/compiler';
import { createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { SIGNAL } from '@angular/core/primitives/signals';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const path = 'src/website/_components/admin-data-table/admin-data-table.component';
const key = 'navrik-au:admin-table:runtime:v1';
const columns = [
  { id: 'name', label: 'Name', value: row => row.name, sortValue: row => row.name, required: true },
  { id: 'total', label: 'Total', value: row => row.total, sortValue: row => row.total, allowBold: true },
  { id: 'id', label: 'ID', value: row => row.id, defaultVisible: false, allowBold: false },
];
const rows = Object.freeze([{ id: 1, name: 'Zulu', total: 4 }, { id: 2, name: 'Alpha', total: 2 }, { id: 3, name: 'Beta', total: 2 }]);
let componentType;
async function create(preferences, unavailable = false) {
  if (!componentType) {
    const source = await read(`${path}.ts`);
    const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, experimentalDecorators: true } }).outputText;
    const resolved = javascript.replace(/from ['"](@angular\/[^'"]+)['"]/g, (_, name) => `from '${import.meta.resolve(name)}'`);
    componentType = (await import(`data:text/javascript,${encodeURIComponent(resolved)}`)).AdminDataTableComponent;
  }
  const storage = new Map(preferences ? [[key, preferences]] : []);
  const injector = createEnvironmentInjector([{ provide: DOCUMENT, useValue: { defaultView: { get localStorage() {
    if (unavailable) throw new Error('Storage blocked');
    return { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  } } } }]);
  const component = runInInjectionContext(injector, () => new componentType());
  const setInput = (name, value) => component[name][SIGNAL].applyValueToInputSignal(component[name][SIGNAL], value);
  setInput('tableId', 'runtime'); setInput('columns', columns); setInput('rows', rows); setInput('rowId', row => row.id);
  component.ngOnChanges();
  return { component, storage, setInput, destroy: () => injector.destroy() };
}

test('sorts ascending/descending stably and never mutates the input array', async () => {
  const { component, destroy } = await create();
  try {
    assert.deepEqual(component.sortedRows().map(row => row.id), [1, 2, 3]);
    component.sortBy('total');
    assert.deepEqual(component.sortedRows().map(row => row.id), [2, 3, 1]);
    assert.equal(component.ariaSort('total'), 'ascending');
    assert.equal(component.ariaSort('name'), 'none');
    component.sortBy('total');
    assert.deepEqual(component.sortedRows().map(row => row.id), [1, 2, 3]);
    assert.equal(component.ariaSort('total'), 'descending');
    component.sortBy('name');
    assert.deepEqual(component.sortedRows().map(row => row.id), [2, 3, 1]);
    component.sortBy('id');
    assert.equal(component.ariaSort('name'), 'ascending');
    assert.deepEqual(rows.map(row => row.id), [1, 2, 3]);
  } finally { destroy(); }
});

test('protects required columns and ignores unknown toggles', async () => {
  const { component, destroy } = await create();
  try {
    component.toggleColumn('name'); component.toggleColumn('missing');
    assert.deepEqual(component.visibleColumns().map(column => column.id), ['name', 'total']);
    component.toggleColumn('total');
    assert.deepEqual(component.visibleColumns().map(column => column.id), ['name']);
  } finally { destroy(); }
});

test('restores and persists sanitised eligible preferences per table', async () => {
  const { component, storage, setInput, destroy } = await create(JSON.stringify({ version: 1, visibleColumnIds: ['id', 'removed'], boldColumnIds: ['total', 'id', 'removed'] }));
  try {
    assert.deepEqual(component.visibleColumns().map(column => column.id), ['name', 'id']);
    assert.equal(component.isBold('total'), true);
    assert.equal(component.isBold('id'), false);
    component.toggleColumn('total');
    assert.deepEqual(JSON.parse(storage.get(key)), { version: 1, visibleColumnIds: ['total', 'id'], boldColumnIds: ['total'] });
    component.toggleBold('total'); component.toggleBold('id'); component.toggleBold('missing');
    assert.equal(component.isBold('total'), false);
    setInput('tableId', 'other'); component.ngOnChanges();
    assert.deepEqual(component.visibleColumns().map(column => column.id), ['name', 'total']);
    assert.deepEqual(JSON.parse(storage.get(key)).visibleColumnIds, ['total', 'id']);
  } finally { destroy(); }
});

for (const preferences of ['broken', '{"version":2}', '{"version":1,"visibleColumnIds":["removed"],"boldColumnIds":[]}', '{"version":1,"visibleColumnIds":{},"boldColumnIds":[]}']) {
  test(`recovers default columns from malformed/stale preferences: ${preferences}`, async () => {
    const { component, destroy } = await create(preferences);
    try { assert.deepEqual(component.visibleColumns().map(column => column.id), ['name', 'total']); }
    finally { destroy(); }
  });
}

test('preserves deliberately hidden optional columns and tolerates blocked storage', async () => {
  const first = await create(JSON.stringify({ version: 1, visibleColumnIds: [], boldColumnIds: [] }));
  try { assert.deepEqual(first.component.visibleColumns().map(column => column.id), ['name']); }
  finally { first.destroy(); }
  const blocked = await create(undefined, true);
  try {
    blocked.component.toggleColumn('total'); blocked.component.toggleBold('name');
    assert.deepEqual(blocked.component.visibleColumns().map(column => column.id), ['name']);
    assert.equal(blocked.component.isBold('name'), true);
  } finally { blocked.destroy(); }
});

test('exposes semantic sortable headers, a column chooser and preserved action/expanded slots', async () => {
  const html = await read(`${path}.html`);
  assert.match(html, /<table\b/);
  assert.match(html, /<caption\b/);
  assert.match(html, /scope="col"/);
  assert.match(html, /scope="row"/);
  assert.match(html, /\[attr\.aria-sort\]/);
  assert.match(html, /<button[^>]*[\s\S]*?sortBy\(column.id\)/);
  assert.match(html, /<summary[^>]*>Columns<\/summary>/);
  assert.match(html, /toggleColumn\(column.id\)/);
  assert.match(html, /\[attr\.aria-pressed\]/);
  assert.match(html, /class="adt-actions"/);
  assert.match(html, /actionsTemplate\(\)/);
  assert.match(html, /expandedTemplate\(\)/);
});

test('turns visible cells into labelled mobile cards and uses semantic theme tokens', async () => {
  const css = await read(`${path}.scss`);
  const html = await read(`${path}.html`);
  assert.match(css, /@media\s*\(max-width:\s*600px\)/);
  assert.match(css, /content:\s*attr\(data-label\)/);
  assert.doesNotMatch(css, /thead\s*\{[^}]*clip-path/, 'mobile sort controls must remain visible');
  assert.match(html, /\[attr\.data-label\]="column.label"/);
  assert.doesNotMatch(css, /\.hide-mobile|#[0-9a-f]{3,8}\b|prefers-color-scheme/i);
  for (const token of ['--admin-surface-raised', '--admin-text', '--admin-text-muted', '--admin-border', '--ui-radius', '--ui-density-padding']) {
    assert.ok(css.includes(`var(${token})`), token);
  }
});
