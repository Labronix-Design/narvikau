import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const decoder = fileURLToPath(new URL('./decode-qr.swift', import.meta.url));
const asset = fileURLToPath(new URL('../../src/assets/warranty-registration-qr.png', import.meta.url));
const warrantyUrl = 'https://navrik.com.au/register-warranty';

test('warranty registration QR asset decodes to the canonical AU URL', () => {
  const moduleCache = mkdtempSync(join(tmpdir(), 'navrik-qr-module-cache-'));
  const output = execFileSync('swift', [decoder, asset], {
    encoding: 'utf8',
    env: { ...process.env, CLANG_MODULE_CACHE_PATH: moduleCache },
  });
  const payloads = output.trim().split('\n').filter(Boolean);

  assert.deepEqual(payloads, [warrantyUrl]);
});
