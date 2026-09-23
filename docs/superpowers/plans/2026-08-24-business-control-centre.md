# Navrik Business Control Centre Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a secure, responsive business-control centre with cached genuine business analytics and safe integration setup states.

**Architecture:** Netlify Database stores business profile, provider setup metadata and cached read models. Authenticated Netlify Functions own invalidation and refresh, while Angular 21 lazy routes render typed read models through reusable accessible dashboard primitives.

**Tech Stack:** Angular 21 standalone components, RxJS, Netlify Functions (ESM), Netlify Database/Postgres, Jasmine/Karma.

**Spec:** `docs/superpowers/specs/2026-08-24-business-control-centre-design.md`

## Global Constraints

- Preserve unrelated user work and do not deploy, push, email, or change production settings without explicit confirmation.
- Every new endpoint verifies the server-side admin session; no client secrets, string-built SQL or client-side cache refresh.
- New money data is integer cents; no USD-to-ZAR conversion without a frozen configured exchange rate.
- Show unavailable data as `Not measured yet` with an explanation; never generate production figures.
- Implement tests first and observe each new behaviour fail before production code.
- Reuse responsive, theme-safe primitives; test desktop and mobile layout after implementation.

---

### Task 1: Cached control-centre data boundary

**Files:** `netlify/database/migrations/0003_control_centre.sql`, `netlify/functions/admin-control-centre.js`, `netlify/functions/admin-analytics.js`, and `netlify/functions/admin-control-centre.test.mjs`.

**Produces:** authenticated cached `GET /api/admin-control-centre`, authenticated selective `POST` refresh, and changed-section invalidation.

- [ ] Write failing tests for unauthenticated refresh rejection, cached read response, unavailable measurements, and section-only invalidation.
- [ ] Run the focused test and verify the endpoint is absent.
- [ ] Add migration and parameterised Neon implementation.
- [ ] Run focused backend tests and verify they pass.

### Task 2: Search and hosting integration boundaries

**Files:** `netlify/functions/admin-search-console.js`, `netlify/functions/admin-hosting.js`, `netlify.toml`, `netlify/functions/admin-search-console.test.mjs`, and `netlify/functions/admin-hosting.test.mjs`.

**Produces:** cached setup/read APIs and authenticated refresh boundaries that expose no secrets or invented provider measurements.

- [ ] Write failing tests for missing-GSC configuration setup state, rejection of non-admin refresh, and hosting unavailable state without an imported provider snapshot.
- [ ] Run focused tests and verify the missing-module failure.
- [ ] Add server-only endpoints and secret-name documentation without values.
- [ ] Run focused backend tests and verify they pass.

### Task 3: Business-control dashboard UI

**Files:** reusable files under `src/website/_components/admin-control/`; new pages under `src/website/_pages/admin/`; `admin.service.ts`; `website.routes.ts`; `admin-shell.component.ts`; matching specs.

**Produces:** theme-safe dashboard primitives and admin-only Overview, Search visibility, Hosting & costs, Reports, and Business profile routes.

- [ ] Write failing component/service tests for setup state, skeleton state, metric formatting and refresh visibility.
- [ ] Run focused Angular tests and verify the behaviours fail.
- [ ] Implement typed service, routes, primitives and responsive views.
- [ ] Run focused Angular tests and verify they pass.

### Task 4: Reporting and selective cache invalidation

**Files:** `netlify/functions/internal-report.js`, affected admin mutation functions, `netlify.toml`, and `netlify/functions/internal-report.test.mjs`.

**Produces:** Saturday/Monday 06:00 SAST internal snapshots, a pre-month invoice-prep reminder, and changed-section-only cache invalidation.

- [ ] Write failing tests for report schedule, no email dispatch and reminder detection.
- [ ] Run focused tests and verify they fail.
- [ ] Add scheduled configuration and minimal report persistence.
- [ ] Run focused tests and verify they pass.

### Task 5: Verification and release gate

- [ ] Run backend tests, focused Angular tests and production build.
- [ ] Perform Playwright checks at phone, tablet and desktop widths.
- [ ] Security-audit every endpoint, auth, database and environment change; fix Critical/High findings and re-review.
- [ ] QA-test integrated cache refresh, unavailable states and responsive layouts.
