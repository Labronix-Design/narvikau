import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { test } from 'node:test';

async function loadMetaPixel() {
  const result = await build({
    entryPoints: ['src/website/_services/meta-pixel.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  });
  const encoded = Buffer.from(result.outputFiles[0].contents).toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

function createDocument() {
  const scripts = [];
  return {
    head: {
      querySelector: (selector) => selector === 'script[data-navrik-meta-pixel]' ? scripts[0] ?? null : null,
      appendChild: (script) => scripts.push(script),
    },
    createElement: () => ({
      async: false,
      src: '',
      attributes: {},
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
    }),
    scripts,
  };
}

test('installs the official Meta Pixel once and queues its initial PageView', async () => {
  const { ensureMetaPixel, trackMetaPixelEvent } = await loadMetaPixel();
  const document = createDocument();
  const window = {};

  ensureMetaPixel(window, document);
  trackMetaPixelEvent(window, 'PageView');
  ensureMetaPixel(window, document);

  assert.deepEqual(window.fbq.queue, [
    ['init', '1103381922272544'],
    ['track', 'PageView'],
  ]);
  assert.equal(document.scripts.length, 1);
  assert.equal(document.scripts[0].src, 'https://connect.facebook.net/en_US/fbevents.js');
  assert.equal(document.scripts[0].attributes['data-navrik-meta-pixel'], '1103381922272544');
  assert.equal(window.fbq.loaded, true);
  assert.equal(window.fbq.version, '2.0');
  assert.equal(window.fbq.push, window.fbq);
});

test('queues events safely before Meta has loaded', async () => {
  const { ensureMetaPixel, trackMetaPixelEvent } = await loadMetaPixel();
  const document = createDocument();
  const window = {};

  ensureMetaPixel(window, document);
  trackMetaPixelEvent(window, 'Lead');

  assert.deepEqual(window.fbq.queue, [
    ['init', '1103381922272544'],
    ['track', 'Lead'],
  ]);
});
