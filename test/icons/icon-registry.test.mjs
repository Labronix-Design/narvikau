import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const iconRegistryPath = new URL('../../src/assets/icons/icon-registry.ts', import.meta.url);

test('registers the Search Console health and comparison icons', async () => {
  const source = await readFile(iconRegistryPath, 'utf8');

  for (const iconName of ['compare_arrows', 'error_outline', 'help_outline']) {
    assert.match(source, new RegExp(`['\\"]${iconName}['\\"]\\s*:`));
  }
});
