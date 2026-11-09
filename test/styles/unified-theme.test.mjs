import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

async function stylesIn(path) {
  const entries = await readdir(new URL(path, root), { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? stylesIn(`${path}/${entry.name}`)
    : entry.name.endsWith('.scss') ? [`${path}/${entry.name}`] : []))).flat();
}

test('lazy admin shell inherits root colours and never follows OS appearance', async () => {
  const shell = await read('src/website/_pages/admin/admin-shell.component.scss');
  assert.doesNotMatch(shell, /prefers-color-scheme/);
  assert.doesNotMatch(shell, /--admin-[\w-]+\s*:/);
  assert.match(shell, /background:\s*var\(--admin-surface-sunken\)/);
  assert.match(shell, /color:\s*var\(--admin-accent-text\)/);
});

test('login uses the saved surface, accent text, radius and density', async () => {
  const login = await read('src/website/_pages/admin/admin-login/admin-login.component.scss');
  for (const token of ['--admin-surface-raised', '--admin-accent-text', '--ui-radius', '--ui-density-padding']) {
    assert.ok(login.includes(`var(${token})`), `login must inherit ${token}`);
  }
});

test('admin and enquiry styles inherit native control appearance instead of fixing dark mode', async () => {
  const paths = [...await stylesIn('src/website/_pages/admin'), 'src/website/_components/quote-modal/quote-modal.component.scss'];
  for (const path of paths) {
    assert.doesNotMatch(await read(path), /(?:prefers-color-scheme|color-scheme:\s*dark)/, path);
  }
});

test('customer inputs, dialogs and loader use shared semantic tokens', async () => {
  const input = await read('src/website/_components/text-input/text-input.component.scss');
  const quote = await read('src/website/_components/quote-modal/quote-modal.component.scss');
  const loader = await read('src/website/_components/page-loader/page-loader.component.ts');
  assert.match(input, /--text-main:\s*var\(--nv-text-main\)/);
  assert.match(input, /--navrik-bg-panel:\s*var\(--nv-surface-raised\)/);
  assert.match(quote, /--qm-text:\s*var\(--nv-text-main\)/);
  assert.match(quote, /--qm-bg:\s*var\(--nv-surface-raised\)/);
  assert.match(loader, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(loader, /--nv-black:\s*#/);
});

test('confirmation, toast, button and upload surfaces share the saved palette', async () => {
  for (const [component, token] of [['confirm-modal', '--cm-bg'], ['toast', '--navrik-bg-panel'], ['button', '--btn-bg']]) {
    const css = await read(`src/website/_components/${component}/${component}.component.scss`);
    assert.match(css, new RegExp(`${token}:\\s*var\\(--nv-surface-raised\\)`));
  }
  const upload = await read('src/website/_components/image-upload/image-upload.component.scss');
  assert.doesNotMatch(upload, /color:\s*#[\da-f]+/i);
});

test('catalogue surfaces no longer force fixed dark backgrounds', async () => {
  for (const path of ['products/products.component.scss', 'products/product-detail/product-detail.component.scss']) {
    const css = await read(`src/website/_pages/${path}`);
    assert.doesNotMatch(css, /background:\s*(?:#[\da-f]+|(?:linear|radial)-gradient\([^;]*#[\da-f]+)/i);
  }
});

test('accent hover states retain the configured accessible accent text', async () => {
  for (const path of ['products/products.component.scss', 'products/product-detail/product-detail.component.scss']) {
    const css = await read(`src/website/_pages/${path}`);
    assert.doesNotMatch(css, /background:\s*var\(--nv-orange-hover\);\s*color:\s*var\(--nv-text-main\)/, path);
    assert.match(css, /background:\s*var\(--nv-orange-hover\);\s*color:\s*var\(--nv-accent-text\)/, path);
  }
});
