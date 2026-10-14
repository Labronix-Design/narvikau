import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseTemplate } from '@angular/compiler';

test('image upload has a keyboard button wired to its native file picker', async () => {
  const source = await readFile(new URL('../../src/website/_components/image-upload/image-upload.component.html', import.meta.url), 'utf8');
  const parsed = parseTemplate(source, 'image-upload.component.html');
  assert.equal(parsed.errors, null);

  const zone = parsed.nodes[0].children.find((node) => node.name === 'div' && node.attributes?.some((attr) => attr.name === 'class' && attr.value === 'drop-zone'));
  assert.ok(zone, 'drop target should be a non-interactive container');
  assert.deepEqual(zone.outputs.map((event) => event.name), ['dragover', 'dragleave', 'drop']);

  const input = zone.children.find((node) => node.name === 'input' && node.attributes?.some((attr) => attr.name === 'type' && attr.value === 'file'));
  assert.ok(input?.references?.some((reference) => reference.name === 'fileInput'));
  assert.ok(input.attributes.some((attr) => attr.name === 'hidden'));

  const pick = zone.children.find((node) => node.name === 'button' && node.attributes?.some((attr) => attr.name === 'class' && attr.value === 'pick-file'));
  assert.ok(pick, 'visible picker needs native button keyboard semantics');
  assert.ok(pick.attributes.some((attr) => attr.name === 'type' && attr.value === 'button'));
  assert.equal(pick.outputs.find((event) => event.name === 'click')?.handler.source, 'fileInput.click()');
  assert.ok(pick.inputs.some((input) => input.name === 'aria-label'));
});
