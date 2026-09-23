import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, repoRoot), 'utf8');
}

test('the public navigation uses a disclosure list rather than an invalid ARIA menu', async () => {
  const template = await source('src/website/_components/navbar/navbar.component.html');

  assert.match(template, /<ul class="drop-grid" aria-label="Shop categories">/);
  assert.match(template, /\[attr\.aria-controls\]="'shop-categories'"/);
  assert.doesNotMatch(template, /role="menu"|role="menuitem"/);
});

test('public shell logos and shop previews come from live settings and cached catalogue data', async () => {
  const navbarTemplate = await source('src/website/_components/navbar/navbar.component.html');
  const navbarSource = await source('src/website/_components/navbar/navbar.component.ts');
  const footerTemplate = await source('src/website/_components/footer/footer.component.html');

  assert.match(navbarTemplate, /@if \(siteSettings\.settings\(\)\.logo_url; as logoUrl\)/);
  assert.match(footerTemplate, /@if \(siteSettings\.settings\(\)\.logo_url; as logoUrl\)/);
  assert.match(navbarTemplate, /siteSettings\.uploadVariantUrl\(logoUrl, 320\)/);
  assert.match(footerTemplate, /siteSettings\.uploadVariantUrl\(logoUrl, 384\)/);
  assert.doesNotMatch(navbarTemplate, /defaultBrandLogoUrl|navrik-primary/);
  assert.doesNotMatch(footerTemplate, /defaultBrandLogoUrl|navrik-primary/);
  assert.match(navbarTemplate, /shopPreview\('canopy'\)/);
  assert.match(navbarTemplate, /shopPreview\('tray'\)/);
  assert.match(navbarTemplate, /shopPreview\('accessory'\)/);
  assert.match(navbarSource, /this\.productService\.products\(\)/);
  assert.match(navbarSource, /this\.accessoryService\.accessories\(\)/);
});

test('the trust bar keeps the list semantic on its actual ul element', async () => {
  const template = await source('src/website/_pages/main/main.component.html');

  assert.match(template, /<section class="trust-bar" aria-label="Product guarantees">/);
  assert.match(template, /<ul class="trust-list">/);
  assert.doesNotMatch(template, /<div class="trust-bar" role="list"/);
});

test('footer navigation labels restart at a valid heading level', async () => {
  const template = await source('src/website/_components/footer/footer.component.html');

  assert.match(template, /<h2 class="col-header">Products & Partners<\/h2>/);
  assert.match(template, /<h2 class="col-header">Information<\/h2>/);
  assert.doesNotMatch(template, /<h4 class="col-header">/);
});

test('hero slide dots have a 24px target while retaining a compact visual marker', async () => {
  const styles = await source('src/website/_pages/main/main.component.scss');

  assert.match(styles, /\.hero-dot\s*\{[\s\S]*?inline-size:\s*1\.5rem;[\s\S]*?block-size:\s*1\.5rem;/);
  assert.match(styles, /\.hero-dot::after\s*\{/);
});

test('public emphasis keeps large hero text readable and uses the configured accent for controls', async () => {
  const styles = await source('src/website/_pages/main/main.component.scss');
  const globalStyles = await source('src/styles.scss');
  const consentStyles = await source('src/website/_components/analytics-consent/analytics-consent.component.scss');

  assert.match(globalStyles, /--nv-text-on-accent:\s*#ffffff;/);
  assert.match(globalStyles, /--nv-accent-readable:\s*var\(--nv-alloy\);/);
  assert.doesNotMatch(globalStyles, /#fec78e|#611909/);
  assert.match(styles, /\.hero-accent\s*\{[\s\S]*?color:\s*var\(--nv-text-main\);/);
  assert.match(styles, /\.hero-cta-btn\s*\{\s*background:\s*var\(--nv-orange\);[\s\S]*?box-shadow:/);
  assert.match(styles, /\.cat-badge\s*\{[\s\S]*?color:\s*var\(--nv-accent-readable\);/);
  assert.match(styles, /\.cat-quote-btn\s*\{[\s\S]*?border-color:\s*var\(--nv-orange\);[\s\S]*?background:\s*var\(--nv-orange\);/);
  assert.match(consentStyles, /\.primary\s*\{[\s\S]*?border:\s*1px solid var\(--nv-orange\);[\s\S]*?background:\s*var\(--nv-cta-surface\);[\s\S]*?color:\s*var\(--nv-text-on-accent\);/);
  assert.doesNotMatch(consentStyles, /#fec78e|#611909/);
});

test('administrator-uploaded hero images use responsive Netlify image variants', async () => {
  const imageLoader = await source('src/website/_components/image-loader/image-loader.component.ts');

  assert.match(imageLoader, /\.netlify\/images\?/);
  assert.match(imageLoader, /\[attr\.srcset\]="responsiveSrcSet\(\)"/);
  assert.match(imageLoader, /640w[\s\S]*960w[\s\S]*1440w[\s\S]*1920w/);
});

test('post-purchase warranty registration has a public route and a normal clickable entry point', async () => {
  const routes = await source('src/website/website.routes.ts');
  const footer = await source('src/website/_components/footer/footer.component.html');

  assert.match(routes, /path:\s*'register-warranty'/);
  assert.match(footer, /routerLink="\/register-warranty"/);
});

test('the public app shell does not impose a route-wide fixed-navigation offset', async () => {
  const shell = await source('src/website/website.component.ts');
  const globalStyles = await source('src/styles.scss');

  assert.doesNotMatch(shell, /styleUrl:\s*'\.\/website\.component\.scss'/);
  assert.doesNotMatch(globalStyles, /website-root \.main-content\s*\{[\s\S]*?padding-block-start:\s*var\(--nv-nav-height\);/);
});
