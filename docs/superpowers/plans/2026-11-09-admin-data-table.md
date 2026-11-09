# Admin Data Table and Modal Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a single responsive, preference-aware admin table and modal editing experience across all applicable Navrik AU dashboard data screens.

**Architecture:** A standalone `AdminDataTableComponent<T>` accepts strongly typed column definitions, rows, cell templates and action/content slots. It owns local, versioned display preferences and client-side sorting. A standalone `AdminDialogComponent` provides the accessible modal shell; page-owned reactive forms remain inside their existing pages and are rendered through that shell so API and validation behaviour remains unchanged.

**Tech Stack:** Angular 21 standalone components, Angular CDK a11y, signals, reactive forms, SCSS, Jasmine/Karma test source and Node source-contract checks.

**Spec:** `docs/superpowers/specs/2026-11-09-admin-data-table-design.md`

## Global Constraints

- Use existing Angular 21 APIs and dependencies only; do not install a table or dialog package.
- Retain existing Netlify APIs, validation, authentication and database behaviour unchanged.
- Use the saved unified site theme tokens in all new UI styling.
- Do not make customer-site behaviour part of this change.
- Maintain keyboard use, focus trapping/restoration, Escape close and labelled responsive content.

## Review Focus

- Corrupt or obsolete local table preferences must fall back safely to supported default columns; test in Task 1.
- Sorting must not mutate source rows or break expanded-row/action identity; test in Task 1 and each rollout task.
- Small viewports must retain row identity, key fields and actions even when optional columns are hidden; test source contract in Task 1 and browser check in Task 5.
- A dialog close while saving must not lose a completed save or restore focus incorrectly; test in Task 2.
- Existing enquiry status quick-save and follow-up workflow must still persist the selected status; test in Task 4.

---

### Task 1: Shared responsive admin data table

**Files:**
- Create: `src/website/_components/admin-data-table/admin-data-table.component.ts`
- Create: `src/website/_components/admin-data-table/admin-data-table.component.html`
- Create: `src/website/_components/admin-data-table/admin-data-table.component.scss`
- Create: `src/website/_components/admin-data-table/admin-data-table.component.spec.ts`
- Create: `src/website/_components/admin-data-table/admin-data-table.models.ts`
- Modify: `src/website/_pages/admin/_admin-shared.scss`
- Test: `test/styles/admin-data-table.test.mjs`

**Interfaces:**
- Produces `AdminTableColumn<T>` with `id`, `label`, `value`, `sortValue`, `defaultVisible`, `required`, `mobilePriority`, and `allowBold`.
- Produces `AdminDataTableComponent<T>` inputs `tableId`, `rows`, `columns`, `rowId`, plus projected cell/action/expanded templates.
- Produces `visibleColumns()`, `sortedRows()`, `toggleColumn(id)`, `toggleBold(id)` and `sortBy(id)` for consuming pages.

- [ ] **Step 1: Write failing component/spec tests**

Cover sorting direction, immutable row ordering, required-column protection, valid persisted preferences, malformed/stale preference recovery, bold selection and accessible header state.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- --include src/website/_components/admin-data-table/admin-data-table.component.spec.ts`

Expected: failure because the component does not exist (if the workspace test target remains absent, record that and run the equivalent existing TypeScript runtime harness).

- [ ] **Step 3: Implement the typed table component and semantic SCSS**

Persist `{version, visibleColumnIds, boldColumnIds}` under `navrik-au:admin-table:<tableId>:v1`; only honour known optional column IDs. Render native semantic tables on desktop and labelled fields/cards on the existing responsive breakpoint. Use client-side stable sorting without modifying `rows`.

- [ ] **Step 4: Add source-contract responsive/style checks**

Assert the column chooser, `aria-sort`, preserved action area, CSS responsive labels and semantic theme variables are present.

- [ ] **Step 5: Run focused verification**

Run: `node --test test/styles/admin-data-table.test.mjs`

Expected: PASS.

### Task 2: Shared admin dialog shell

**Files:**
- Create: `src/website/_components/admin-dialog/admin-dialog.component.ts`
- Create: `src/website/_components/admin-dialog/admin-dialog.component.html`
- Create: `src/website/_components/admin-dialog/admin-dialog.component.scss`
- Create: `src/website/_components/admin-dialog/admin-dialog.component.spec.ts`
- Modify: `src/website/_pages/admin/_admin-shared.scss`

**Interfaces:**
- Produces `AdminDialogComponent` inputs `open`, `title`, `description`, `busy`, `closeDisabled`; output `closed`.
- Consumes projected page-owned form content and footer actions.

- [ ] **Step 1: Write failing modal tests**

Verify focus is captured/restored, Escape/backdrop closes only when not busy/disabled, dialog labels are connected, and body scrolling is restored after close/destruction.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- --include src/website/_components/admin-dialog/admin-dialog.component.spec.ts`

Expected: failure because the component does not exist or lacks behaviour.

- [ ] **Step 3: Implement the standalone dialog shell**

Use `CdkTrapFocus`, restore the invoking element, keep page reactive forms projected instead of duplicating form state, and use unified theme tokens.

- [ ] **Step 4: Run focused verification**

Run: `npm test -- --include src/website/_components/admin-dialog/admin-dialog.component.spec.ts`

Expected: PASS or documented no-test-target limitation with an equivalent runtime result.

### Task 3: Migrate Products and Categories

**Files:**
- Modify: `src/website/_pages/admin/admin-products/admin-products.component.ts`
- Modify: `src/website/_pages/admin/admin-products/admin-products.component.html`
- Modify: `src/website/_pages/admin/admin-products/admin-products.component.scss`
- Modify: `src/website/_pages/admin/admin-products/admin-products.component.spec.ts`
- Modify: `src/website/_pages/admin/admin-categories/admin-categories.component.ts`
- Modify: `src/website/_pages/admin/admin-categories/admin-categories.component.html`
- Modify: `src/website/_pages/admin/admin-categories/admin-categories.component.scss`
- Modify: `src/website/_pages/admin/admin-categories/admin-categories.component.spec.ts`

**Interfaces:**
- Consumes `AdminDataTableComponent<CatalogProduct | AdminCategory>` and `AdminDialogComponent`.
- Keeps existing `openCreate`, `openEdit`, save/delete and position-reordering methods as page APIs.

- [ ] **Step 1: Extend failing product/category tests**

Assert each page provides named column definitions, opens create/edit in a dialog, preserves product variants/expanded detail, and still sends the existing save payload.

- [ ] **Step 2: Migrate Products**

Replace the product listing table with table definitions for index/name, slug, category, position, visibility and actions. Place the existing product and variant forms inside dialogs; retain position warnings, images and gallery functionality.

- [ ] **Step 3: Migrate Categories**

Replace the category listing table and move the existing create/edit form into a dialog without changing sort-position or active-category logic.

- [ ] **Step 4: Run page verification**

Run: `npm test -- --include src/website/_pages/admin/admin-products/admin-products.component.spec.ts --include src/website/_pages/admin/admin-categories/admin-categories.component.spec.ts`

Expected: PASS or documented no-test-target limitation plus runtime verification.

### Task 4: Migrate Enquiries and Warranty Registrations

**Files:**
- Modify: `src/website/_pages/admin/admin-queries/admin-queries.component.ts`
- Modify: `src/website/_pages/admin/admin-queries/admin-queries.component.html`
- Modify: `src/website/_pages/admin/admin-queries/admin-queries.component.scss`
- Modify: `src/website/_pages/admin/admin-queries/admin-queries.component.spec.ts`
- Modify: `src/website/_pages/admin/admin-warranties/admin-warranties.component.ts`
- Modify: `src/website/_pages/admin/admin-warranties/admin-warranties.component.html`
- Modify: `src/website/_pages/admin/admin-warranties/admin-warranties.component.scss`
- Modify: `src/website/_pages/admin/admin-warranties/admin-warranties.component.spec.ts`

**Interfaces:**
- Consumes the shared table/dialog components.
- Retains `updateStatus`, `saveFollowUp`, `saveNotes`, filter tabs and server-side enquiry loading.

- [ ] **Step 1: Add failing workflow tests**

Cover configurable enquiry/warranty columns, sorting, manual enquiry dialog submission, follow-up dialog submit/cancel and no regression in per-row status pending values.

- [ ] **Step 2: Migrate Enquiries**

Use columns for date, customer, type, product, message, location and status. Keep filter tabs and direct status selects in the row. Move manual enquiry, full detail, notes and follow-up forms into dialogs while retaining row expansion only for compact summary if still needed.

- [ ] **Step 3: Migrate Warranty Registrations**

Use display-only column definitions for registration, customer, product, vehicle and purchase/fitment. Preserve date formatting and empty/loading/error states.

- [ ] **Step 4: Run page verification**

Run: `npm test -- --include src/website/_pages/admin/admin-queries/admin-queries.component.spec.ts --include src/website/_pages/admin/admin-warranties/admin-warranties.component.spec.ts`

Expected: PASS or documented no-test-target limitation plus runtime verification.

### Task 5: Cross-dashboard verification and review

**Files:**
- Modify: `test/styles/admin-data-table.test.mjs`
- Modify: relevant component specs created above

- [ ] **Step 1: Run complete functional and source checks**

Run: `node --test test/styles/admin-data-table.test.mjs && npm run test:functions && npm run build`

Expected: all test suites and the production build pass.

- [ ] **Step 2: Perform desktop and narrow viewport browser checks**

Verify Products, Categories, Enquiries and Warranties: sort controls, column chooser persistence, bold columns, mobile labels/actions, edit/create dialogs, status updates and focus restoration.

- [ ] **Step 3: Run security and QA review gate**

Have the security reviewer check modal focus/data boundaries and QA validate the customer-visible admin workflows. Resolve any Critical/High findings and re-run the affected checks.

## Self-review

All spec goals map to Tasks 1–4. The five most likely interaction failures are listed in Review Focus and assigned to Task 1, 2 or 4. Task interfaces use one component pair shared by each rollout, with no endpoint or database change. The plan intentionally does not introduce a new dependency or cross-site setting.
