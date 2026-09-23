# Navrik Australia Canopies-Only Clone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Convert a direct Navrik South Africa code clone into an independent, database-backed Australian canopies catalogue with the established enquiry workflows and no payment capability.

**Architecture:** Copy the source repository's tracked tree first, preserving Angular and Netlify structure. Then remove payment and non-canopy concerns in the schema, API, routes, UI, assets, and operations. The AU Netlify site supplies its own domain, database, and mail configuration.

**Tech Stack:** Angular 21 standalone components, RxJS, Angular Material, Netlify Functions, Netlify Database, Resend, Node test runner, Karma/Jasmine.

**Spec:** docs/superpowers/specs/2026-09-23-navrik-au-clone-design.md

## Global Constraints

- Import /Users/hannolabuschagne/Documents/GitHub/navrik; do not recreate the site or edit the South African repository.
- Only Adventure, Overland, Sports, and Defender canopy models may exist publicly or in AU product administration.
- Remove—not hide—cart, checkout, Yoco, orders, finance, coupons, trays, accessories, packages, and compatibility.
- Retain contact, quote, warranty, public content, analytics consent, uploads, legal pages, and admin authentication.
- Use https://navrik.com.au; retain no SA domain, locale, currency, time-zone, or payment copy.
- AU Netlify database/email/hosting values remain outside Git. Do not deploy, configure live Netlify, send mail, push, or create a PR without another confirmation.

## Review Focus

- Cached data cannot cause a tray/accessory to render.
- /accessories and /finance lead to /products.
- Product detail opens a named quote and cannot import cart/checkout code.
- Contact/quote validation and rate limiting survive the reduction.
- SEO cannot expose navrik.co.za, en-ZA, South Africa, ZAR, SAST, or payment language.

## File Structure

- Source-clone baseline: root config, src, netlify, and test.
- AU data: netlify/database/migrations/0001_create-navrik-au-schema.sql and netlify/assets/seed.mjs.
- Catalogue contract: catalog-storefront.js, catalog-products.js, _catalogue-cache.js, and catalog.models.ts.
- UI: website routes/shell/nav/footer/product/detail/quote/admin files.
- Domain identity: CNAME, Netlify config, metadata/sitemap, and retained email handlers.
- Tests: test/au-boundary.test.mjs, existing function tests, Angular specs, and sitemap test.

### Task 1: Import and baseline the source application

**Files:**
- Create: tracked application files from /Users/hannolabuschagne/Documents/GitHub/navrik.
- Preserve: approved AU specification and this plan.
- Exclude: .git, node_modules, .env files, and credentials.

**Interfaces:**
- Consumes: source repository HEAD.
- Produces: a separately versioned direct source clone before AU reductions.

- [ ] **Step 1: Record the exact source revision**

Run:

~~~bash
git -C /Users/hannolabuschagne/Documents/GitHub/navrik rev-parse HEAD
git status --short
~~~

Expected: record the source commit; target contains only AU documents.

- [ ] **Step 2: Copy only tracked source contents**

Run from the AU repository:

~~~bash
git -C /Users/hannolabuschagne/Documents/GitHub/navrik archive --format=tar HEAD | tar -xf -
~~~

Restore the AU spec/plan if a path conflicts. Do not copy source Git metadata or deployed environment values.

- [ ] **Step 3: Establish the unmodified-clone baseline**

~~~bash
npm ci
npm run test:functions
npm test -- --watch=false --browsers=ChromeHeadless
npm run build
~~~

Expected: record all baseline output; document inherited failures without weakening tests.

- [ ] **Step 4: Commit the source import separately**

~~~bash
git add -A
git commit -m "chore: import Navrik source baseline"
~~~

### Task 2: Establish red tests for the AU boundary

**Files:**
- Create: test/au-boundary.test.mjs
- Modify: src/generate-sitemap.test.cjs
- Test: both with Node’s built-in test runner.

**Interfaces:**
- Consumes: source clone paths/configuration.
- Produces: executable proof that retired features, SA identity, and non-canopy records cannot remain.

- [ ] **Step 1: Write the failing tree-boundary test**

Create test/au-boundary.test.mjs:

~~~js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('AU seed has exactly four supported canopies', () => {
  const seed = read('netlify/assets/seed.mjs');
  for (const slug of ['adventure', 'overland', 'sports', 'defender']) {
    assert.match(seed, new RegExp('navrik-canopy-' + slug));
  }
  assert.doesNotMatch(seed, /navrik-(?:standard|premium)-tray|const ACCESSORIES/);
});

test('AU has no payment entry point', () => {
  for (const file of [
    'netlify/functions/create-checkout.js',
    'netlify/functions/yoco-webhook.js',
    'src/website/_components/cart/cart.component.ts',
  ]) assert.equal(fs.existsSync(path.join(root, file)), false, file + ' must be removed');
});
~~~

Add equivalent absence checks for finance, accessory, compatibility, order, coupon, and payment-report function/component paths.

- [ ] **Step 2: Add failing AU sitemap assertions**

In src/generate-sitemap.test.cjs require:

~~~js
assert.match(sitemap, /https:\/\/navrik\.com\.au\/products/);
assert.doesNotMatch(sitemap, /navrik\.co\.za|\/accessories|\/finance/);
assert.deepEqual(business.areaServed, { '@type': 'Country', name: 'Australia' });
assert.equal(website.inLanguage, 'en-AU');
~~~

- [ ] **Step 3: Verify the red state**

~~~bash
node --test test/au-boundary.test.mjs src/generate-sitemap.test.cjs
~~~

Expected: FAIL because the imported source has SA/payment/multi-category functionality.

- [ ] **Step 4: Commit the failing contract tests**

~~~bash
git add test/au-boundary.test.mjs src/generate-sitemap.test.cjs
git commit -m "test: define Australian canopies-only boundary"
~~~

### Task 3: Replace multi-category/payment data with a fresh AU canopy schema

**Files:**
- Delete: old payment/catalogue migration history in netlify/database/migrations and netlify/database/_migrations.
- Create: netlify/database/migrations/0001_create-navrik-au-schema.sql.
- Modify: seed, catalogue functions/cache, and src/website/_models/catalog.models.ts.
- Delete: catalog-accessories.js, catalog-compatibility.js, admin-accessories.js, admin-compatibility.js, admin-categories.js, admin-coupons.js, admin-promo-config.js, and promo-status.js.
- Test: catalog product/storefront function tests and AU boundary test.

**Interfaces:**
- Consumes: existing canopy records and gallery assets.
- Produces: a storefront model with products and settings, where every product is category canopy and no purchase/price/accessory/compatibility/package section exists.

- [ ] **Step 1: Write failing function contract tests**

In test/functions/catalog-products.test.mjs require:

~~~js
assert.deepEqual(JSON.parse(response.body), [{
  id: 7, slug: 'navrik-canopy-adventure',
  name: 'Navrik Canopy — Adventure', category: 'canopy', gallery_urls: [],
}]);
assert.doesNotMatch(response.body, /purchaseMode|price_cents|tray|accessory/i);
~~~

In the storefront test require every returned product to be a canopy and accessories, compatibility, and packages to be absent.

- [ ] **Step 2: Verify red**

~~~bash
node --test test/functions/catalog-products.test.mjs test/functions/catalog-storefront.test.mjs test/au-boundary.test.mjs
~~~

Expected: FAIL against the source purchase-mode/multi-section response.

- [ ] **Step 3: Implement the schema and seed**

Replace history with one fresh schema retaining customers/leads/rate limits; warranties; admin users/sessions/audit; site settings/public content/legal; uploads; cache/read models; non-revenue analytics/reporting; and catalog products/variants.

Do not define order, Yoco, cart, coupon, finance, accessory, compatibility, package, or purchase-mode tables, columns, or triggers. Seed only Adventure, Overland, Sports, and Defender and rebuild only products read-model data.

Simplify the application contract:

~~~ts
export interface CatalogProduct {
  id: number; slug: string; name: string; category: 'canopy'; size: string | null;
  color: string; description: string | null; image_url: string | null; sort_order: number;
  gallery_urls: string[]; material: string | null; thickness: string | null;
  front_door_window: string | null; side_door: string | null; rear_door: string | null;
  vehicle_fit: string | null;
}
~~~

- [ ] **Step 4: Remove obsolete static assets/tests**

Delete tray/accessory images under src/assets/images and tests exclusively covering removed functions. Keep canopy, logo, font, icon, warranty, and public-video assets used by retained pages.

- [ ] **Step 5: Verify green and commit**

~~~bash
node --test test/functions/catalog-products.test.mjs test/functions/catalog-storefront.test.mjs test/au-boundary.test.mjs
git add netlify src test
git commit -m "feat: add canopies-only Australian catalogue"
~~~

Expected: PASS; only canopies can be read and retired sections/functions are absent.

### Task 4: Remove payment/non-canopy Angular flows and retain named quotes

**Files:**
- Modify: website routes/root shell, navbar/footer, main/products/product-detail/quote-modal, product/storefront/admin services, and admin shell.
- Delete: cart component/service; accessory/category/promo/finance services; finance model; accessories/finance pages; admin orders/accessories/compatibility/categories/coupons/finance-content pages.
- Test: product/detail and admin-shell specs plus AU boundary test.

**Interfaces:**
- Consumes: quote-only CatalogProduct.
- Produces: canopies products/detail routes; accessories/finance redirects to products; no cart/payment imports.

- [ ] **Step 1: Write failing canopy quote tests**

Extend product specs with:

~~~ts
products.set([{ id: 1, slug: 'navrik-canopy-adventure', name: 'Navrik Canopy — Adventure',
  category: 'canopy', size: 'Adventure', color: 'black', description: null, image_url: null,
  sort_order: 1, gallery_urls: [], material: null, thickness: null, front_door_window: null,
  side_door: null, rear_door: null, vehicle_fit: null }]);
fixture.detectChanges();
expect(fixture.nativeElement.querySelector('[data-quote-product="navrik-canopy-adventure"]')).not.toBeNull();
expect(fixture.nativeElement.textContent).not.toContain('checkout');
~~~

Add a route-source test requiring both redirects/no retired lazy imports and an admin-shell test excluding Sales, Orders, Vouchers, Accessories, Compatibility, Categories, and Finance.

- [ ] **Step 2: Verify red**

~~~bash
npm test -- --watch=false --browsers=ChromeHeadless --include='src/website/_pages/products/**/*.spec.ts' --include='src/website/_pages/admin/admin-shell.component.spec.ts'
~~~

Expected: FAIL because source products/navigation still expose checkout and retired areas.

- [ ] **Step 3: Implement quote-only canopies UI**

Remove root cart imports/template/close calls. Simplify navbar to Canopies and Contact; remove cart counts, finance link, tray/combo/accessory tiles and services. Update footer/metadata/main fragments to canopies.

Remove purchase modes, prices, variants, accessory, and CartService logic from product list/detail. Each canopy opens the existing quote modal with its exact name. Remove price/payment copy. Remove retired routes/admin methods/menu entries and add both redirects.

- [ ] **Step 4: Delete dead UI after imports are removed**

Delete exactly the files listed above and eliminate dangling styles/imports.

- [ ] **Step 5: Verify green and commit**

~~~bash
npm test -- --watch=false --browsers=ChromeHeadless --include='src/website/_pages/products/**/*.spec.ts' --include='src/website/_pages/admin/admin-shell.component.spec.ts'
node --test test/au-boundary.test.mjs
git add src test
git commit -m "feat: make Australian site canopies and quotes only"
~~~

### Task 5: Retain AU enquiry/warranty operations, remove order/payment operations

**Files:**
- Modify: contact/quote email handlers, public submission, warranty/admin-control/enquiry/analytics/report functions as required by retained schema.
- Delete: checkout, Yoco webhook, admin-orders, finance, coupon functions, payment reports/schedules, and corresponding obsolete tests.
- Test: contact/quote/public-submission/warranty/internal-report tests and AU boundary test.

**Interfaces:**
- Consumes: EMAIL_API_KEY, NETLIFY_DATABASE_URL, AU site settings, validated leads.
- Produces: source-equivalent contact/quote semantics with AU mail identity and no payment/order API.

- [ ] **Step 1: Write failing AU identity/resilience tests**

With injected sendEmail spies, assert:

~~~js
assert.equal(sent[0].from, 'Navrik <info@navrik.com.au>');
assert.equal(sent[0].to, 'info@navrik.com.au');
assert.match(sent[1].html, /navrik\.com\.au/);
assert.doesNotMatch(sent.map((message) => message.html).join('\n'), /navrik\.co\.za|Built Tough for Africa/);
~~~

Retain/add invalid quote 400 and rate-limited quote 429 tests.

- [ ] **Step 2: Verify red**

~~~bash
node --test test/functions/public-submission.test.mjs test/functions/warranty-registration.test.mjs test/functions/order-email-warranty.test.mjs
~~~

Expected: identity assertions fail on source mail; replace order-only assertions rather than retaining orders.

- [ ] **Step 3: Implement AU identity and retained functions**

Replace source mail/domain/Africa copy with info@navrik.com.au, https://navrik.com.au, and neutral/Australian copy. Keep server-side Resend, validation, rate limiting, persistence, and cache invalidation. Rename quote lead source to canopy_quote; retain only enquiry/warranty/content reporting that does not query revenue/orders.

- [ ] **Step 4: Verify green and commit**

~~~bash
npm run test:functions
node --test test/au-boundary.test.mjs
git add netlify test
git commit -m "feat: retain Australian enquiry operations without payments"
~~~

### Task 6: Convert domain, SEO, metadata, and operator setup to AU

**Files:**
- Modify: CNAME, netlify.toml, index metadata, sitemap generator/test, robots, website component, retained templates, and README.
- Create: docs/netlify-au-configuration.md.
- Test: sitemap and AU boundary tests.

**Interfaces:**
- Consumes: canonical origin https://navrik.com.au.
- Produces: AU canonical/OG/schema/sitemap/robots and non-secret Netlify setup documentation.

- [ ] **Step 1: Write failing identity scan**

Add a boundary-test scan over retained source/config files:

~~~js
assert.doesNotMatch(content, /navrik\.co\.za|en-ZA|South Africa|\bZAR\b|\bSAST\b/i);
assert.doesNotMatch(content, /yoco|create-checkout|online_checkout|shopping_cart/i);
~~~

Exclude only historical docs/superpowers and package-lock.json.

- [ ] **Step 2: Verify red**

~~~bash
node --test test/au-boundary.test.mjs src/generate-sitemap.test.cjs
~~~

Expected: FAIL against source SA identity and payment strings.

- [ ] **Step 3: Implement AU metadata/configuration**

Set CNAME to navrik.com.au; set canonical/OG/schema/sitemap to https://navrik.com.au, en-AU, Australia, and canopies-only descriptions. Sitemap lists only home, products, contact, privacy/terms/refund/warranty. Set retained function origin fallbacks to AU origin.

Document variable names only: NETLIFY_DATABASE_URL, EMAIL_API_KEY, ADMIN_PASSWORD, ADMIN_APP_ORIGIN, cache/site IDs, and AU recipients; plus DB migration/seed and custom-domain DNS steps. Never include values/secrets.

- [ ] **Step 4: Verify green and commit**

~~~bash
node --test test/au-boundary.test.mjs src/generate-sitemap.test.cjs
git add CNAME netlify.toml src README.md docs test
git commit -m "feat: configure Navrik Australia domain and SEO"
~~~

### Task 7: Complete verification and the mandatory review gate

**Files:**
- Modify only defect-owning files identified by verification/review.
- Test: full Node functions, Karma suite, production build, source scan, browser flows.

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces: evidence that AU builds, retains enquiries, and has no payment/non-canopy surface.

- [ ] **Step 1: Run all automated checks**

~~~bash
npm run test:functions
npm test -- --watch=false --browsers=ChromeHeadless
npm run build
rg -n -i --glob '!docs/superpowers/**' --glob '!package-lock.json' 'navrik\.co\.za|en-ZA|South Africa|\bZAR\b|\bSAST\b|yoco|create-checkout|online_checkout|shopping_cart' .
~~~

Expected: all verification commands exit 0; final scan has no retained production/configuration match.

- [ ] **Step 2: Browser acceptance**

Verify home/products show four canopies; every detail opens its named quote; validation works without live mail; accessories/finance redirect to products; mobile/desktop have no cart/payment UI; metadata/sitemap are AU-only.

- [ ] **Step 3: Review endpoints and test evidence**

Use security-auditor for a read-only review because Netlify HTTP endpoints/environment reads changed. Use qa-tester to inspect red-green evidence and add/run necessary regression coverage. Fix all critical/high findings and failures in their owning task; after two failed re-check cycles on one issue, stop and ask the user.

- [ ] **Step 4: Report verified state without release actions**

~~~bash
git status --short
git log --oneline --max-count=8
~~~

Report exact test, build, browser, and reviewer outcomes. Do not deploy, configure Netlify, send mail, push, or open a PR.
