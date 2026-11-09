# Unified Theme System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Site Settings one saved, accessible semantic theme that controls the complete Navrik public and admin experience without OS light/dark overrides.

**Architecture:** A versioned `theme` JSONB object becomes the canonical persistent palette while legacy colours remain compatible. `SiteSettingsService` applies semantic public and admin CSS variables on `:root`; all UI layers consume those variables. The Settings page edits, previews, resets, validates, and persists the same object.

**Tech Stack:** Angular 21 standalone components/signals/reactive forms, SCSS CSS variables, Netlify Functions, Netlify Database with `@neondatabase/serverless`, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-09-unified-theme-system-design.md`

## Global Constraints

- Preserve existing primary/background/font settings by backfilling the new canonical theme during migration.
- No automatic `prefers-color-scheme` behaviour or per-page exceptions.
- Use parameterised SQL and exact allowlists; no client-side secrets.
- Every colour is `#` plus six hexadecimal digits; reject unknown theme keys and invalid enums.
- Require accessible primary text/background and accent-text/accent contrast before persistence.
- Apply the saved theme at every responsive breakpoint to public UI, admin login, shell, controls, tables, dialogs, loaders, empty/error states, and product galleries.
- Do not add dependencies.

## Review Focus

- A legacy row without `theme` must produce the same visible primary/background/font colours after read and save; Task 1 adds migration/read tests.
- An unknown nested theme key or malformed palette must fail before SQL; Task 1 adds function tests.
- A low-contrast text or accent-text pairing must fail safely; Task 1 adds contrast tests.
- A preview before lazy admin-shell creation must colour admin login and later-loaded shell; Task 2 adds service tests.
- Narrow mobile and wide desktop UI must consume semantic tokens rather than reintroduce hard-coded surfaces; Task 3 verifies compiled styles and Playwright screenshots.

---

### Task 1: Persist and serve the canonical semantic theme

**Files:**
- Create: `netlify/database/migrations/0008_unified_theme.sql`
- Modify: `netlify/functions/admin-site-settings.js`
- Modify: `netlify/functions/site-settings.js`
- Modify: `netlify/functions/catalog-storefront.js`
- Modify: `test/functions/admin-site-settings.test.mjs`
- Modify: `test/functions/site-settings.test.mjs`
- Modify: `test/functions/catalog-storefront.test.mjs`

**Interfaces:**
- Produces `theme` with the version, semantic colours, `radius`, and `density` specified in the design.
- Consumed by Task 2 through the `SiteSettings` model and by public/admin read paths.

- [ ] **Step 1: Write failing function tests**

Add tests proving legacy fallback, public payload parity, exact-key validation, contrast rejection, enum rejection, safe error responses, and tagged cache invalidation after a successful save.

- [ ] **Step 2: Run the focused function tests to verify they fail**

Run: `node --test test/functions/admin-site-settings.test.mjs test/functions/site-settings.test.mjs test/functions/catalog-storefront.test.mjs`

Expected: FAIL because canonical `theme` support and validation do not exist.

- [ ] **Step 3: Add migration and function support**

Create a reversible migration that adds/backfills/checks `site_settings.theme`. Add pure theme normalisation and contrast validation helpers in `admin-site-settings.js`, expose canonical defaults from both public readers, and return generic 500 errors.

- [ ] **Step 4: Run focused tests and the full function suite**

Run: `npm run test:functions`

Expected: 0 failures.

- [ ] **Step 5: Commit Task 1**

Commit message: `feat: persist unified site theme`.

### Task 2: Apply one theme from root and expose structured settings controls

**Files:**
- Modify: `src/website/_models/site-settings.models.ts`
- Modify: `src/website/_services/site-settings.service.ts`
- Modify: `src/website/_services/site-settings.service.spec.ts`
- Modify: `src/website/_pages/admin/admin-site-settings/admin-site-settings.component.ts`
- Modify: `src/website/_pages/admin/admin-site-settings/admin-site-settings.component.html`
- Modify: `src/website/_pages/admin/admin-site-settings/admin-site-settings.component.scss`
- Modify: `src/website/_pages/admin/admin-site-settings/admin-site-settings.component.spec.ts`

**Interfaces:**
- Consumes the canonical `SiteTheme` supplied by Task 1.
- Produces root `--nv-*`, `--admin-*`, `--ui-radius`, and `--ui-density-*` variables used by Task 3.

- [ ] **Step 1: Write failing Angular specs**

Cover legacy-theme normalisation, root-level application before admin shell exists, preview/reset, successful canonical commit, and settings-form validation for all structured controls.

- [ ] **Step 2: Run the focused specs to verify they fail**

Run the configured Angular test target for the affected spec files. If the project still lacks a test target, record the exact CLI failure and run a build after implementation.

- [ ] **Step 3: Implement model, root token service, and settings UI**

Define `SiteTheme`; normalise legacy fields to it; apply root tokens only; replace the four loose palette controls with named structured controls, corner style, density, preview, reset, and accessible helper copy. Preserve font, logo, hero, compatibility, and contact controls.

- [ ] **Step 4: Verify build and service behaviour**

Run: `npm run build`

Expected: production build exits 0.

- [ ] **Step 5: Commit Task 2**

Commit message: `feat: add structured theme controls`.

### Task 3: Remove appearance exclusions and tokenise responsive UI

**Files:**
- Modify: `src/styles.scss`
- Modify: `src/website/_pages/admin/admin-shell.component.scss`
- Modify: `src/website/_pages/admin/admin-login/admin-login.component.scss`
- Modify: `src/website/_pages/admin/_admin-shared.scss`
- Modify: affected admin page SCSS files discovered by the colour audit
- Modify: `src/website/_components/quote-modal/quote-modal.component.scss`
- Modify: `src/website/_components/text-input/text-input.component.scss`
- Modify: `src/website/_components/page-loader/page-loader.component.ts`
- Test: relevant admin-shell/login component specs and Playwright checks

**Interfaces:**
- Consumes root semantic tokens from Task 2.
- Produces responsive customer and admin surfaces with no OS appearance override.

- [ ] **Step 1: Write failing presentation/behaviour tests**

Add assertions that the admin shell has no `prefers-color-scheme` override and that login/shell inherit semantic tokens. Prepare Playwright checks at phone and desktop widths for public and admin routes.

- [ ] **Step 2: Run focused checks to verify current exclusions**

Run relevant specs and inspect the current CSS/search results. Expected: existing media override and hard-coded surface/text values are found.

- [ ] **Step 3: Replace exclusions with semantic tokens**

Remove the system appearance block. Tokenise shell/sidebar/navigation/shared admin primitives, login, dialogs, inputs, loaders, empty/error states, and page-level exceptions. Preserve success/warning/danger intent through derived semantic variables. Honour radius and density at all responsive breakpoints.

- [ ] **Step 4: Verify responsive pages and full build**

Run `npm run build` and Playwright smoke checks at mobile and desktop widths for `/`, `/admin/login`, and authenticated `/admin/settings`; confirm no OS-scheme override remains and no contrast/readability regressions are visible.

- [ ] **Step 5: Commit Task 3**

Commit message: `fix: apply saved theme across all interfaces`.

### Task 4: Final quality gate

**Files:**
- Review: complete task diff

**Interfaces:**
- Verifies Tasks 1–3 as a single release.

- [ ] **Step 1: Run final verification**

Run: `npm run test:functions && npm run build && git diff --check`

Expected: all function tests and production build pass; no whitespace errors.

- [ ] **Step 2: Run required security and QA reviews**

Have a security reviewer inspect migration, HTTP endpoint, validation, and cache invalidation changes. Have a QA reviewer validate test coverage and responsive user flows.

- [ ] **Step 3: Commit any review fixes**

Commit message: `fix: address unified theme review findings`.
