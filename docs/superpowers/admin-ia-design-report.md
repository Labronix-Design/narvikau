# Admin information architecture and design report

## Status

Implemented the admin-only business-control redesign. No routes, guards, noindex behaviour, backend functions, public pages, global styles, deployment settings, or external systems were changed. The Angular admin service now has typed client contracts for the separately cached server snapshots.

## What changed

- `/admin/overview` is now a decision page: linked business totals, data health, last-updated freshness, an action queue, and activity. It does not render an order work table.
- `/admin/orders` is now **Sales & orders**, an order work queue with recorded status counts, desktop table and mobile detail cards. It never infers money units: a total is shown as exact `R1,234.56` only for `total_incl_vat_cents`; legacy totals show `Not measured`.
- `/admin/analytics` is now **Sales performance**. It consumes the dedicated `sales_performance` envelope only, displays the server's paid/confirmed cents values exactly, and renders a server-provided `not_measured` reason instead of empty charts or tables.
- `/admin/search-visibility` is now **Search & website traffic**. It has snapshot health and freshness, shows only server-provided comparisons, hides secure configuration variable names, and turns query/page rows into fully wrapping mobile cards.
- `/admin/reports` is **Reporting**. Hosting and cost content was removed from the visible report sections and fallback copy.
- Navigation now uses everyday language: Sales & orders, Customer enquiries, Sales performance, Search & website traffic, and Reporting.
- Added reusable `website-control-health`: every health outcome combines its required icon, label, and semantic colour — `Ready`, `Needs attention`, `Action required`, or `Not measured`. Details are exposed with Angular Material tooltips.
- Enhanced reusable metric cards with optional routing and explanatory Material tooltips. Loading skeleton shimmer is neutral rather than blue.
- Added inherited admin-only light/dark-safe semantic tokens, resilient `min-width: 0` content layouts, focus outlines, wrapping content, and responsive cards/tables. No global style file was changed.
- Corrected the cache contract after QA: overview now consumes `data.business_overview`, refreshes only the valid `business_overview` section, and analytics makes one valid `sales_performance` request. The old `business` section and retired multi-request analytics flow are no longer used by these pages.

## Files

- `src/website/_components/admin-control/control-health.component.{ts,html,scss}`
- `src/website/_components/admin-control/control-metric.component.{ts,html,scss}`
- `src/website/_components/admin-control/control-state.component.scss`
- `src/website/_pages/admin/admin-shell.component.{ts,scss}`
- `src/website/_pages/admin/_admin-shared.scss`
- `src/website/_pages/admin/admin-control-centre/admin-control-centre.component.{ts,html,scss}`
- `src/website/_pages/admin/admin-dashboard/admin-dashboard.component.{ts,html,scss}`
- `src/website/_pages/admin/admin-analytics/admin-analytics.component.{ts,html,scss}`
- `src/website/_pages/admin/admin-analytics/admin-analytics.component.spec.ts`
- `src/website/_pages/admin/admin-search-console/admin-search-console.component.{ts,html,scss}`
- `src/website/_pages/admin/admin-reporting/admin-reporting.component.{ts,html,scss}`
- `src/website/_services/admin.service.ts`

## Verification

- `npx tsc --noEmit -p tsconfig.website.json` — passed.
- `npm run build` — passed. Initial bundle: 689.35 kB raw / 181.67 kB estimated transfer; all relevant admin pages remain lazy chunks.
- `git diff --check -- <admin scope>` — passed with no whitespace errors.
- Added focused overview and sales-performance envelope/UI specs. `npx ng test` cannot run because `angular.json` has no `test` target (`Cannot determine project or target for command`).
- `npx tsc --noEmit -p tsconfig.spec.json` is blocked by existing syntax errors in `src/website/_services/cart.service.spec.ts` at lines 20, 41, and 51; those files are outside this scope. The new specs were not executed.

## Remaining concerns

- The orders work queue still uses the legacy `/api/admin-orders` response. Its money remains `Not measured` unless an explicit `total_incl_vat_cents` field is present. Sales performance no longer uses the legacy analytics fields.
- Authenticated browser checks at 390, 768, 1024, and 1440px, light/dark schemes, keyboard navigation, and console inspection were not run in this task. The CSS implements the responsive and focus paths, but those live checks remain for QA.
- Existing monthly-report service types retain a `hosting` field for compatibility. It is not shown anywhere in the reporting UI; removing the field requires the separately owned backend/service-contract change.
