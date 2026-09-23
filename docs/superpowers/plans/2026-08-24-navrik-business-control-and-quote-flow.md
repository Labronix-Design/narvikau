# Navrik Business Control and Quote Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent quote-only products from reaching checkout and make Navrik's admin pages a coherent, accessible business-control centre.

**Architecture:** Resolve purchase mode in the server-side catalogue read model and enforce it again in checkout. Move admin pages onto a typed, independently invalidated read-model boundary and reusable Angular business-dashboard primitives. Public and admin views consume only server snapshots and use the shared semantic design tokens.

**Tech Stack:** Angular 21 standalone components and Angular Material; Netlify Functions; Netlify Database using `@neondatabase/serverless`; Node test runner; Karma/Jasmine; Playwright/Chrome DevTools.

**Spec:** `docs/superpowers/specs/2026-08-24-navrik-business-control-and-quote-flow-design.md`

## Global Constraints

- Preserve existing rows; use a nullable migration and resolve missing mode from positive integer-cent price.
- Store and present money in integer cents; UI uses exact `R1,234.56` rendering.
- Only authenticated admin mutations and refreshes rebuild server read models; clients only read snapshots.
- Quote-only products and accessories never show payment/cart UI and checkout must reject them server-side.
- Trends and health states must be derived only from measured data and include text plus icon plus semantic colour.
- Do not add dependencies, deploy, push, send email, or modify production settings.

---

### Task 1: Server-side catalogue purchase contract

**Files:**
- Modify: `netlify/functions/_catalogue-cache.js`
- Modify: `netlify/functions/create-checkout.js`
- Modify: existing catalogue schema/migration helper used by the cache
- Test: `test/functions/catalogue-cache.test.mjs`
- Test: `test/functions/create-checkout.test.mjs`

**Interfaces:**
- Produces `purchaseMode: 'online_checkout' | 'quote_only'` on every cached product/accessory.
- Produces a checkout validation error with code `QUOTE_ONLY_ITEM` before a payment request is created.

- [ ] **Step 1: Write failing cache tests**

```js
assert.equal(resolvePurchaseMode({ priceCents: 0, purchaseMode: null }), 'quote_only');
assert.equal(resolvePurchaseMode({ priceCents: 199900, purchaseMode: null }), 'online_checkout');
assert.equal(resolvePurchaseMode({ priceCents: 199900, purchaseMode: 'quote_only' }), 'quote_only');
```

- [ ] **Step 2: Run the focused cache test and confirm it fails because `resolvePurchaseMode` is absent.**

Run: `node --test test/functions/catalogue-cache.test.mjs`

- [ ] **Step 3: Add the nullable database migration and resolver.**

```js
export function resolvePurchaseMode({ priceCents, purchaseMode }) {
  if (purchaseMode === 'quote_only') return 'quote_only';
  if (purchaseMode === 'online_checkout' && Number(priceCents) > 0) return 'online_checkout';
  return Number(priceCents) > 0 ? 'online_checkout' : 'quote_only';
}
```

- [ ] **Step 4: Run the focused cache test and confirm it passes.**

- [ ] **Step 5: Write a failing checkout test for a quote-only selection.**

```js
await assert.rejects(
  () => resolveCheckoutSelection({ purchaseMode: 'quote_only', priceCents: 0 }),
  error => error.code === 'QUOTE_ONLY_ITEM',
);
```

- [ ] **Step 6: Run the checkout test and confirm it fails because quote-only values are accepted.**

Run: `node --test test/functions/create-checkout.test.mjs`

- [ ] **Step 7: Reject quote-only and non-positive checkout selections before Yoco is invoked.**

```js
if (item.purchaseMode !== 'online_checkout' || item.priceCents <= 0) {
  const error = new Error('This item is quoted to order and cannot be checked out online.');
  error.code = 'QUOTE_ONLY_ITEM';
  throw error;
}
```

- [ ] **Step 8: Re-run both focused function suites and confirm they pass.**

### Task 2: Public catalogue truthfulness and responsive repair

**Files:**
- Modify: `src/website/_pages/products/products.component.*`
- Modify: `src/website/_pages/products/product-detail/product-detail.component.*`
- Modify: `src/website/_pages/accessories/accessories.component.*`
- Modify: `src/website/_components/cart/cart.component.*`
- Test: relevant Angular component specs or existing public E2E coverage

**Interfaces:**
- Consumes `purchaseMode` from cached catalogue API models.
- Produces quote-only views with only an enquiry route/action.

- [ ] **Step 1: Write a failing public UI test asserting a quote-only item has no cart/checkout CTA and does have `Request a quote`.**
- [ ] **Step 2: Run it and confirm the current detail component exposes the checkout CTA.**
- [ ] **Step 3: Implement purchase-mode conditional rendering and neutral catalogue language.**
- [ ] **Step 4: Add `min-width: 0`, responsive specification stacks, standard public gutters, and remove unintentional hero spacer rules.**
- [ ] **Step 5: Run focused UI tests and a browser check at 390, 768, and 1440px.**

### Task 3: Cached business read models and page responsibility

**Files:**
- Modify: `netlify/functions/admin-control-centre.js`
- Modify: `netlify/functions/admin-analytics.js`
- Modify: relevant cache invalidation helpers and admin mutation functions
- Test: `test/functions/admin-control-centre.test.mjs`
- Test: `test/functions/admin-cache-invalidation.test.mjs`

**Interfaces:**
- Produces explicit `business_overview`, `sales_performance`, `orders`, and `enquiries` snapshot states, scopes, period comparisons, actions, and health.
- Uses `revenueCents` only for paid/confirmed orders.

- [ ] **Step 1: Write failing tests that distinguish paid revenue from pending order value and assert that an order mutation invalidates only overview/sales/orders.**
- [ ] **Step 2: Run focused tests and confirm the existing aggregation/cache invalidation fails those definitions.**
- [ ] **Step 3: Implement typed cents-based snapshot builders with safe legacy read fallback and scoped cache keys.**
- [ ] **Step 4: Implement narrow invalidation/rebuild selection for order, enquiry, and Google actions.**
- [ ] **Step 5: Re-run focused suites and the complete function suite.**

### Task 4: Reusable admin dashboard primitives and navigation

**Files:**
- Modify: `src/styles.scss`
- Modify: `src/website/_components/admin-control/control-metric.component.*`
- Create: `src/website/_components/admin-control/control-health.component.*`
- Create: `src/website/_components/admin-control/control-page-header.component.*`
- Modify: `src/website/_pages/admin/admin-shell.component.*`
- Modify: `src/website/_pages/admin/admin-control-centre/admin-control-centre.component.*`
- Test: relevant component specs

**Interfaces:**
- `ControlHealthComponent` accepts `state: 'ready' | 'attention' | 'action-required' | 'not-measured'`.
- Metric cards accept exact presentation, explanatory tooltip, comparison, and optional `routerLink`.

- [ ] **Step 1: Write failing component tests for a labelled/icon health state, a tooltip description, and a linked metric card.**
- [ ] **Step 2: Run the tests and confirm the current metric/control components cannot render those contracts.**
- [ ] **Step 3: Add semantic theme tokens, light-mode overrides, neutral skeleton tokens, health component, page header, and tooltip support.**
- [ ] **Step 4: Rebuild overview as a decision page with linked metrics, genuine comparison only, health, action queue, and activity.**
- [ ] **Step 5: Rename navigation in everyday language and verify focus/keyboard behaviour.**
- [ ] **Step 6: Run focused Angular tests and build.**

### Task 5: Detail screens with no duplicated analytics

**Files:**
- Modify: `src/website/_pages/admin/admin-dashboard/admin-dashboard.component.*`
- Modify: `src/website/_pages/admin/admin-analytics/admin-analytics.component.*`
- Modify: `src/website/_pages/admin/admin-search-console/admin-search-console.component.*`
- Modify: `src/website/_pages/admin/admin-reporting/admin-reporting.component.*`
- Modify: shared admin table/list styles
- Test: relevant component specs

**Interfaces:**
- Orders page exposes order work and order-specific state only.
- Sales performance consumes sales read model; search page consumes its existing Google snapshot comparison.

- [ ] **Step 1: Write failing tests for route/page headings and mobile detail-card rendering.**
- [ ] **Step 2: Run tests and confirm current orders/analytics content overlaps and mobile grids cannot meet the contract.**
- [ ] **Step 3: Refactor orders into `Sales & orders`, sales analytics into `Sales performance`, and search into `Search & website traffic`; preserve authenticated route guards.**
- [ ] **Step 4: Replace fixed grids with responsive ranked-data cards, exact value formatting, accessible chart summaries, and no clipped long URL/query text.**
- [ ] **Step 5: Remove hosting/cost references from reporting.**
- [ ] **Step 6: Run focused Angular tests and build.**

### Task 6: Review and visual verification

**Files:**
- Test: existing function, Angular, and Playwright tests; no production code required unless a finding needs correction.

- [ ] **Step 1: Security-audit all endpoint, database, cache, auth, and environment-variable changes.**
- [ ] **Step 2: Have QA verify the new tests failed before implementation and pass afterward.**
- [ ] **Step 3: Run `npm run test:functions`, relevant Angular tests, `npx tsc --noEmit -p tsconfig.website.json`, and `npm run build`.**
- [ ] **Step 4: Exercise authenticated admin and public pages at 390×844, 768×1024, 1024×900, and 1440×900 in light/dark colour schemes. Assert no unwanted horizontal overflow, no console errors, correct quote-only CTA, status labels/icons, tooltips, skeletons, and keyboard focus.**
- [ ] **Step 5: Report exact verification results and any unverified condition.**

## Self-review

- Spec coverage: Tasks 1–2 cover the purchase contract and public UI; Task 3 covers genuine cached business data and narrow invalidation; Tasks 4–5 cover information architecture, responsive design, language, status and reporting scope; Task 6 covers required gates and visual QA.
- Placeholder scan: no deferred implementation placeholders are present.
- Interface consistency: `purchaseMode` and health-state unions are defined once and used consistently by their consumer tasks.
