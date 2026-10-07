import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Netlify-owned catalogue migration does not commit its own transaction', async () => {
  const source = await readFile(
    new URL('../../netlify/database/migrations/0002_generalise-catalogue-products.sql', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(source, /^\s*(?:BEGIN|COMMIT);\s*$/im);
});
