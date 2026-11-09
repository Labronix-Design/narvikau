import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import { compile } from 'sass';

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(sourceDirectory, '../../../..');
let temporaryDirectory;
let AdminDialogComponent;
let angular;
let common;

before(async () => {
  temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'admin-dialog-test-'));
  await symlink(path.join(workspace, 'node_modules'), path.join(temporaryDirectory, 'node_modules'));
  const output = path.join(temporaryDirectory, 'dialog.mjs');
  await build({
    entryPoints: [path.join(sourceDirectory, 'admin-dialog.component.ts')],
    outfile: output,
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  });
  await import('@angular/compiler');
  angular = await import('@angular/core');
  common = await import('@angular/common');
  ({ AdminDialogComponent } = await import(pathToFileURL(output).href));
});

after(async () => {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
});

function fakeDocument(initialOverflow = '', initialPriority = '') {
  let overflow = initialOverflow;
  let priority = initialPriority;
  const style = {
    getPropertyValue: name => name === 'overflow' ? overflow : '',
    getPropertyPriority: name => name === 'overflow' ? priority : '',
    setProperty(name, value, importance = '') {
      if (name === 'overflow') { overflow = value; priority = importance; }
    },
    removeProperty(name) {
      if (name === 'overflow') { overflow = ''; priority = ''; }
    },
  };
  return { body: { style }, get overflow() { return overflow; }, get priority() { return priority; } };
}

function createDialog(document) {
  const injector = angular.createEnvironmentInjector(
    [{ provide: common.DOCUMENT, useValue: document }], angular.Injector.NULL,
  );
  const component = angular.runInInjectionContext(injector, () => new AdminDialogComponent());
  const setInput = (name, value) => {
    const node = component[name][angular.ɵSIGNAL];
    node.applyValueToInputSignal(node, value);
    component.ngOnChanges();
  };
  return { component, injector, setInput };
}

test('Escape and backdrop dismiss only when the dialog is open and not busy or disabled', () => {
  const document = fakeDocument();
  const { component, injector, setInput } = createDialog(document);
  let closes = 0;
  component.closed.subscribe(() => closes++);
  const backdrop = {};
  const keyEvent = { stopPropagation() {}, preventDefault() {} };
  try {
    component.onBackdropClick({ target: backdrop, currentTarget: backdrop });
    assert.equal(closes, 0);
    setInput('open', true);
    component.onBackdropClick({ target: {}, currentTarget: backdrop });
    assert.equal(closes, 0);
    setInput('busy', true);
    component.onEscape(keyEvent);
    component.onBackdropClick({ target: backdrop, currentTarget: backdrop });
    assert.equal(closes, 0);
    setInput('busy', false);
    setInput('closeDisabled', true);
    component.onEscape(keyEvent);
    assert.equal(closes, 0);
    setInput('closeDisabled', false);
    component.onEscape(keyEvent);
    component.onBackdropClick({ target: backdrop, currentTarget: backdrop });
    assert.equal(closes, 2);
  } finally {
    component.ngOnDestroy();
    injector.destroy();
  }
});

test('programmatic close while busy restores exact body overflow and nested locks', () => {
  const document = fakeDocument('scroll', 'important');
  const first = createDialog(document);
  const second = createDialog(document);
  try {
    first.setInput('open', true);
    second.setInput('open', true);
    assert.equal(document.overflow, 'hidden');
    first.setInput('busy', true);
    first.setInput('open', false);
    assert.equal(document.overflow, 'hidden');
    second.component.ngOnDestroy();
    assert.equal(document.overflow, 'scroll');
    assert.equal(document.priority, 'important');
  } finally {
    first.component.ngOnDestroy();
    second.component.ngOnDestroy();
    first.injector.destroy();
    second.injector.destroy();
  }
});

test('installed CDK trap restores the previously focused element on destruction', async () => {
  const { CdkTrapFocus, FocusTrapFactory } = await import('@angular/cdk/a11y');
  const { Platform } = await import('@angular/cdk/platform');
  const focused = { calls: 0, focus() { this.calls++; } };
  const previousDocument = globalThis.document;
  globalThis.document = { activeElement: focused };
  let trapDestroyed = false;
  const trap = {
    attachAnchors() { return true; },
    focusInitialElementWhenReady() { return Promise.resolve(true); },
    destroy() { trapDestroyed = true; },
  };
  const injector = angular.createEnvironmentInjector([
    { provide: angular.ElementRef, useValue: new angular.ElementRef({}) },
    { provide: FocusTrapFactory, useValue: { create: () => trap } },
    { provide: Platform, useValue: { isBrowser: true } },
  ], angular.Injector.NULL);
  try {
    const directive = angular.runInInjectionContext(injector, () => new CdkTrapFocus());
    directive.autoCapture = true;
    directive.ngAfterContentInit();
    directive.ngOnDestroy();
    assert.equal(trapDestroyed, true);
    assert.equal(focused.calls, 1);
  } finally {
    globalThis.document = previousDocument;
    injector.destroy();
  }
});

test('compiled dialog CSS keeps all regions reachable in a short viewport', async () => {
  const css = compile(path.join(sourceDirectory, 'admin-dialog.component.scss')).css;
  const dialogRule = css.match(/\.adlg-dialog\s*\{([^}]*)\}/)?.[1] ?? '';
  const bodyRule = css.match(/\.adlg-body\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(dialogRule, /overflow-y:\s*auto/);
  assert.doesNotMatch(dialogRule, /overflow:\s*hidden/);
  assert.match(bodyRule, /flex:\s*0 0 auto/);
});
