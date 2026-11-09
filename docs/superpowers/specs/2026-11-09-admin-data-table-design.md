# Reusable Admin Data Table and Modal Editor Design

## Intent

Make the Navrik AU admin dashboard faster to use on desktop and mobile. Admin users must be able to tailor tables to the information they need, while create and edit actions remain focused in modal dialogs rather than pushing the table down the page.

## Goals

- Use one responsive table component for Products, Categories, Customer Enquiries, and Warranty Registrations.
- Allow each table to sort its data by supported columns.
- Let an admin show or hide optional columns and select columns whose values should be emphasised in bold.
- Persist each table's presentation choices in the browser, independently per table and with a schema version for safe future changes.
- Open create/edit flows in accessible modal dialogs for Products, Categories, manual Enquiries, Variants, and Enquiry follow-ups.
- Preserve all current API contracts, validation, permissions, filters, status updates, positions, and expandable detail behaviour.
- Remain fully usable at small viewports with labelled card-style rows and the same actions.

## Non-goals

- No database schema, endpoint, authentication, or customer-site changes.
- No change to Warranty Registration data (it is read-only); it receives the presentation controls only.
- No server-side persistence or sharing of an individual administrator's layout preferences in this iteration.

## Approaches considered

1. **Reusable data table plus reusable form-dialog framework — selected.** Typed column definitions keep labels, sorting, visibility, bold rendering, responsive labels, and saved settings consistent. A shared dialog shell lets existing page forms move into overlays without duplicating focus, close, loading, or error behaviour.
2. Per-page table and modal changes. Faster for the first page but repeats interaction logic and allows inconsistent functionality to reappear.

The selected approach is the only one that meets the requirement that all applicable admin tables work alike and remain adaptable as new catalogue categories/products arrive.

## Table design

Each page supplies a table identity, rows, and a declarative column list. A column defines its label, value getter, sort getter, mobile priority, default visibility, and optional action/content template. The shared component provides:

- Keyboard-operable sortable headers with direction indicators and `aria-sort`.
- A compact **Columns** panel with visibility toggles and a bold-value toggle for eligible columns.
- Mandatory identity/action columns that cannot be hidden where hiding would make a table unusable.
- Stable row order until an admin selects a sort.
- Local preferences stored under a versioned Navrik AU key and sanitised against the current column list.
- A responsive breakpoint that retains identity and actions while rendering visible values as labelled fields.
- Empty/loading/error slots supplied by each page, retaining the existing copy and recovery actions.

## Modal design

A shared `AdminDialog` shell will provide the overlay, focus management, Escape/backdrop close handling when safe, scroll containment, an accessible title/description, a busy state, and a consistent footer. Existing reactive form markup moves inside page-owned dialog content so all existing client validation and submission logic stays intact. Delete confirmations continue using the existing confirmation service.

The following move to dialogs: product create/edit, category create/edit, manual enquiry entry, product variants, and enquiry follow-up edits. Enquiry status quick changes remain in the table because they are a direct one-field operation; detailed editing opens a dialog.

## Compatibility and verification

The components will use the existing Angular 21 standalone component patterns and theme tokens. Tests will cover preference sanitising/persistence, sorting, column toggles, modal open/close and retained page-level save paths. A production build plus current function tests will confirm no backend regression; responsive desktop/mobile browser checks will validate the rendered experience.
