# Catalogue Positioning Implementation Plan

> **For agentic workers:** Use the approved specialist delegation and verify each task before completion.

**Goal:** Make catalogue categories, products and variants consistently positionable, with occupied positions visibly explained and other items shifted without losing their relative order.

**Architecture:** Store contiguous, one-based positions for all records, including inactive records. Categories are ordered globally; products within their category; variants within their product and variant type. The server performs each reorder and corresponding snapshot update atomically, and the admin refreshes affected lists after each successful mutation.

**Tech Stack:** Angular 21, Netlify Functions, Netlify Database/Postgres, Node test runner.

**Spec:** User-approved description in this conversation on 23 October 2026, including variants wherever applicable.

## Global Constraints

- Preserve existing uncommitted enquiry workflow changes and migration 0005.
- Do not change payment, email, Meta Pixel or unrelated catalogue behaviour.
- No new dependencies. Do not push or deploy without separate approval.
- Preserve active and inactive records and their relative ordering during migration.

## Review Focus

- Repeated legacy positions, zero and negative values: deterministically normalise without losing records.
- Concurrent administrators: prevent lost reorders and partial or stale read-model snapshots.
- Moving an item up or down, deleting it, changing its category/type, and inserting at an occupied position: close gaps and shift only the affected scope.
- Inactive items: count them in positions and display occupant information so later activation does not reorder unexpectedly.
- Invalid, stale or out-of-range positions and failed saves: reject safely or append consistently, preserve the saved order and show an actionable error.

### Task 1: Ordering persistence and catalogue snapshots

**Files:** `netlify/database/migrations/0006_catalogue_positions.sql`, `netlify/functions/admin-categories.js`, `netlify/functions/admin-products.js`, `netlify/functions/_catalogue-cache.js`, and related `test/functions/*.test.mjs`.

- [ ] Add failing tests for normalization and insertion/move/delete in each scope, cross-category/type moves, invalid input, rollback, cache refresh and concurrent mutations.
- [ ] Add migration 0006 to normalise existing positions deterministically without deleting records.
- [ ] Implement 1-based server-side reordering in a transaction with serialisation/retry and atomic catalogue snapshots; invalidate public cache only after commit.
- [ ] Verify focused ordering tests and `npm run test:functions` pass.

### Task 2: Admin position controls and public display

**Files:** `src/website/_pages/admin/admin-categories/`, `src/website/_pages/admin/admin-products/`, catalogue models/services and relevant public pages and tests.

- [ ] Add failing tests for occupied-position information, insertion and move feedback, scoped variant/product lists, refreshing affected records, and failed saves.
- [ ] Provide 1-based position fields for category, product and variant creation/editing, with the occupied item's name and the resulting shift explained before save.
- [ ] Reload affected admin lists after writes; ensure public catalogue, homepage and product detail follow the appropriate order.
- [ ] Run the production build and available frontend tests; explicitly report if the Angular test target is unavailable.

### Task 3: Independent verification

- [ ] Review the complete diff for security, database integrity and concurrency; have QA independently verify the frontend/backend contract and regression tests.
- [ ] Verify real database migration and authenticated browser flows where a safe test database is available; otherwise report that limitation.
- [ ] Run `git diff --check`, full function tests and `npm run build`; report the state of the prior enquiry work and request approval before any production release.
