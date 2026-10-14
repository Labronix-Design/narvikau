import '@angular/compiler';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { FormGroup } from '@angular/forms';

// Exercise the real reactive-form models without the absent Angular test target.
async function modelUrl(name, replacements = {}) {
  const source = await readFile(new URL(`../../_models/${name}.ts`, import.meta.url), 'utf8');
  let { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  for (const [specifier, url] of Object.entries({ '@angular/forms': import.meta.resolve('@angular/forms'), ...replacements })) {
    outputText = outputText.replaceAll(`'${specifier}'`, `'${url}'`);
  }
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
}

const sourceUrl = await modelUrl('enquiry-source.models');
const { sourceDetailRequiredValidator } = await import(sourceUrl);
const { enquiryControls, enquiryPayload } = await import(await modelUrl('enquiry-location.models', { './enquiry-source.models': sourceUrl }));
const makeForm = () => new FormGroup(enquiryControls(), sourceDetailRequiredValidator);

test('rejects invalid AU locations even when assigned directly to the form', () => {
  const form = makeForm();
  form.patchValue({ DiscoverySource: 'Google Search' });
  for (const Location of [null, { state: 'Gauteng', suburb: 'Richmond' }, { state: 'Victoria', suburb: ' ' }, { state: 'Victoria', suburb: 'x'.repeat(161) }]) {
    form.patchValue({ Location });
    assert.equal(form.valid, false, JSON.stringify(Location));
  }
  form.patchValue({ Location: { state: 'Victoria', suburb: ' Richmond ' } });
  assert.equal(form.valid, true);
});

test('validates referral details only while the selected source requires them', () => {
  const form = makeForm();
  form.patchValue({ Location: { state: 'Queensland', suburb: 'Brisbane' }, DiscoverySource: 'Referral', DiscoverySourceDetail: ' ' });
  assert.equal(form.valid, false);
  form.patchValue({ DiscoverySourceDetail: 'A customer recommendation' });
  assert.equal(form.valid, true);
  form.patchValue({ DiscoverySourceDetail: 'x'.repeat(121) });
  assert.equal(form.valid, false);
  form.patchValue({ DiscoverySource: 'Google Search' });
  assert.equal(form.valid, true, 'hidden stale detail must not block a valid source');
});

test('rejects a referral value outside the public API enum', () => {
  const form = makeForm();
  form.patchValue({ Location: { state: 'Victoria', suburb: 'Richmond' }, DiscoverySource: 'Unknown' });
  assert.equal(form.valid, false);
});

test('flattens and trims the public contract without sending hidden referral details', () => {
  assert.deepEqual(enquiryPayload({ Name: 'Alex', Location: { state: 'Victoria', suburb: ' Richmond ' }, DiscoverySource: 'Google Search', DiscoverySourceDetail: 'Old referral detail' }), {
    Name: 'Alex', LocationState: 'Victoria', LocationSuburb: 'Richmond', DiscoverySource: 'Google Search', DiscoverySourceDetail: '',
  });
  assert.equal(enquiryPayload({ Location: { state: 'Victoria', suburb: 'Richmond' }, DiscoverySource: 'Referral', DiscoverySourceDetail: ' Customer ' }).DiscoverySourceDetail, 'Customer');
});
