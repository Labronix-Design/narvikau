# Catalogue Packages and Edge Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure, dynamic catalogue packages and make public product reads fail safely rather than as an unhandled Edge error.

**Architecture:** Packages are an independently cached server read model made from relational source items. Admin mutations alone update cache sections; checkout re-resolves package eligibility and amount from the database. Public UI is route-lazy-loaded and purchase mode follows configured positive price.

**Tech Stack:** Angular 21 standalone components/signals, Netlify Functions, Netlify Database/Postgres via `@neondatabase/serverless`, Jasmine/Karma, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-02-catalogue-packages-and-edge-resilience-design.md`

## Global Constraints

- Keep money as integer cents at rest and calculate checkout amounts only server-side.
- Require existing admin authentication for every write/read admin action.
- Use tagged-template SQL only; never expose environment values to the client.
- Public reads neither rebuild nor purge cache; mutations update only affected read-model sections.
- Preserve Navrik token-based dark/light-safe visual system; use responsive layouts and accessible controls.
- Do not deploy, push, email, or alter production configuration in this plan.

---

### Task 1: Safe public product endpoint

**Files:**
- Modify: `netlify/functions/catalog-products.js`
- Test: `test/functions/catalog-products.test.mjs`

**Interfaces:**
- Produces: `createCatalogProductsHandler({ getSql })`, returning `503` with no-store cache headers for missing database configuration.

- [ ] Write a failing test that deletes both database URL variables, calls the exported handler, and asserts `503` plus `Netlify-CDN-Cache-Control: no-store`.
- [ ] Run `node --test test/functions/catalog-products.test.mjs` and observe failure because the client construction throws before the boundary.
- [ ] Move database client creation inside a try/catch through an injectable handler factory; return JSON `Catalog temporarily unavailable` on failure.
- [ ] Re-run the focused Node test and observe it pass.

### Task 2: Package schema and cached public read model

**Files:**
- Create: `netlify/database/migrations/0017_catalogue_packages.sql`
- Modify: `netlify/functions/_public-cache.js`
- Modify: `netlify/functions/_catalogue-cache.js`
- Create: `netlify/functions/catalog-packages.js`
- Test: `test/functions/catalogue-cache.test.mjs`
- Test: `test/functions/catalog-packages.test.mjs`

**Interfaces:**
- Produces: read-model section `packages`; public `/api/catalog-packages`; cache tag `catalogue:packages`.

- [ ] Write failing cache tests asserting inactive source members suppress a package and package responses carry `catalogue:packages` cache tags.
- [ ] Run the two focused tests and observe failures due to the missing builder/endpoint.
- [ ] Add relational package tables/checks and expand cache builders, permitted sections, and cache tags.
- [ ] Add the read-only endpoint with cached success and uncached failure responses.
- [ ] Re-run the focused tests and observe passes.

### Task 3: Protected package administration and targeted invalidation

**Files:**
- Create: `netlify/functions/admin-packages.js`
- Modify: `netlify/functions/_mutation-cache-invalidation.js`
- Modify: `netlify/functions/admin-products.js`
- Modify: `netlify/functions/admin-accessories.js`
- Test: `test/functions/admin-packages.test.mjs`
- Test: `test/functions/admin-catalogue-purchase-mode.test.mjs`

**Interfaces:**
- Consumes: `rebuildCatalogueReadModels(sql, ['packages'])`, `purgeMutationCache('package', ...)`.
- Produces: authenticated GET/POST/PUT/DELETE `/api/admin-packages`.

- [ ] Write failing function tests for unauthorized access, fewer-than-two members, inactive member rejection, cents conversion, and only package-tag purging.
- [ ] Run focused tests and observe the missing endpoint behaviour.
- [ ] Implement parameterised validation and CRUD, rebuilding only `packages` after package changes.
- [ ] Extend product/accessory mutation paths to rebuild/purge `packages` with their own section only when a package may be affected.
- [ ] Re-run focused tests and observe passes.

### Task 4: Server-authoritative package checkout

**Files:**
- Modify: `netlify/functions/create-checkout.js`
- Test: `test/functions/create-checkout.test.mjs`

**Interfaces:**
- Consumes: cart slug `package:<slug>`.
- Produces: resolved checkout line with stored package cents or a validation rejection.

- [ ] Write failing tests for a package checkout using its stored cents despite a browser-supplied amount, and quote-only/inactive package rejection.
- [ ] Run the focused checkout tests and observe failures.
- [ ] Resolve package and all active members in the existing checkout transaction; reject variants/accessories supplied for a package.
- [ ] Re-run focused checkout tests and observe passes.

### Task 5: Public Packages pages and cart action

**Files:**
- Modify: `src/website/_models/catalog.models.ts`
- Create: `src/website/_services/package.service.ts`
- Create: `src/website/_pages/packages/packages.component.{ts,html,scss,spec.ts}`
- Create: `src/website/_pages/packages/package-detail/package-detail.component.{ts,html,scss,spec.ts}`
- Modify: `src/website/website.routes.ts`
- Modify: `src/website/_components/navbar/navbar.component.{ts,html,scss}`

**Interfaces:**
- Produces: `/packages`, `/packages/:slug`, `PackageService`, and cart slug `package:<slug>`.

- [ ] Write failing Angular specs that show Add to cart only for a positive package price and Request a quote otherwise.
- [ ] Run the focused Karma specs and observe failure because the pages/service do not exist.
- [ ] Implement lazy routes, loading/empty/error states, package cards/detail content, semantic image alt text and primary purchase action.
- [ ] Re-run focused specs and observe passes.

### Task 6: Admin package editor

**Files:**
- Create: `src/website/_pages/admin/admin-packages/admin-packages.component.{ts,html,scss,spec.ts}`
- Modify: `src/website/_services/admin.service.ts`
- Modify: `src/website/_pages/admin/admin-shell.component.ts`
- Modify: `src/website/website.routes.ts`

**Interfaces:**
- Consumes: `AdminService.getPackages/createPackage/updatePackage/deletePackage`.
- Produces: protected `/admin/packages` with unlimited member rows.

- [ ] Write a failing component test for adding/removing arbitrary member rows and price/quote action labels.
- [ ] Run its focused Karma spec and observe failure because the editor does not exist.
- [ ] Implement the admin page with source-item selectors, quantity inputs, inline errors, image inputs and confirmation for removal.
- [ ] Re-run focused specs and observe passes.

### Task 7: Review and verification

**Files:**
- Modify: `docs/superpowers/plans/2026-09-02-catalogue-packages-and-edge-resilience.md`

- [ ] Request security review for schema, endpoint, environment and checkout changes; fix any critical/high finding and re-check.
- [ ] Request QA review; add any missing regression coverage and re-run it.
- [ ] Run `npm run test:functions`, relevant `ng test` suites, and `npm run build`.
- [ ] Run the app with `netlify dev`, smoke public/admin routes, and visually inspect 375px and desktop package layouts with reduced motion enabled.
