import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const iconRegistryPath = new URL('../../src/assets/icons/icon-registry.ts', import.meta.url);

async function iconRegistry() {
  const source = await readFile(iconRegistryPath, 'utf8');
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  return (await import(`data:text/javascript,${encodeURIComponent(javascript)}`)).APP_ICONS;
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const children = await Promise.all(entries.map(async (entry) => {
    const path = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  }));
  return children.flat().filter((path) => /\.(html|ts)$/.test(path.pathname) && !path.pathname.endsWith('.spec.ts'));
}

test('registers the Search Console health and comparison icons', async () => {
  const source = await readFile(iconRegistryPath, 'utf8');

  for (const iconName of ['compare_arrows', 'error_outline', 'help_outline']) {
    assert.match(source, new RegExp(`['\\"]${iconName}['\\"]\\s*:`));
  }
});

test('registers the login, event, and notification icons used in Admin', async () => {
  const icons = await iconRegistry();
  for (const name of ['login', 'event', 'notifications']) {
    assert.match(icons[name] ?? '', /^<svg\b[^>]*>.*<\/svg>$/);
    assert.match(icons[name], /<(path|circle|rect|polygon|line)\b/);
  }
});

test('registers each literal icon referenced by website templates and data', async () => {
  const icons = await iconRegistry();
  const references = new Set();
  const directory = new URL('../../src/website/', import.meta.url);
  for (const path of await sourceFiles(directory)) {
    const source = await readFile(path, 'utf8');
    for (const match of source.matchAll(/\bsvgIcon="([\w-]+)"|\bicon:\s*['"]([\w-]+)['"]/g)) {
      references.add(match[1] || match[2]);
    }
    for (const match of source.matchAll(/\[svgIcon\]="([^"]+)"/g)) {
      for (const literal of match[1].matchAll(/[?:]\s*'([\w-]+)'/g)) references.add(literal[1]);
    }
  }
  assert.deepEqual([...references].filter((name) => !icons[name]).sort(), []);
});
