# Cached business read models — QA review

## Spec Compliance

**Partially compliant — request changes.** The server-side model meets the core cache-boundary requirements: it stores the requested business sections separately, gates every control-centre refresh behind admin authentication, reads GET snapshots without rebuilding, marks stale/missing sections `not_measured`, and uses a paid-status, non-test cent query for revenue. Legacy analytics modes return `not_measured` before creating a database client/query.

However, the deployed Angular consumers still use the removed `business` response shape and refresh section. The overview refresh therefore receives a `400`, and the overview/analytics pages do not render the new snapshots. This is a user-visible regression and means the end-to-end business-control flow is not compliant.

## Strengths

- Revenue is limited to `deposit_paid`, `in_production`, `ready`, and `completed` orders; the aggregate excludes `yoco_test` and uses cent fields before the documented legacy decimal fallback ([admin-control-centre.js:6](../../netlify/functions/admin-control-centre.js#L6), [admin-control-centre.js:186](../../netlify/functions/admin-control-centre.js#L186)). Pending, failed, and cancelled statuses are outside the allowlist.
- `GET /api/admin-control-centre` only selects cached rows and a profile; invalidated rows are returned as `not_measured`, not recomputed ([admin-control-centre.js:142](../../netlify/functions/admin-control-centre.js#L142), [admin-control-centre.js:150](../../netlify/functions/admin-control-centre.js#L150)). `admin-analytics` likewise reads one cache row and reports stale data as not measured ([admin-analytics.js:21](../../netlify/functions/admin-analytics.js#L21), [admin-analytics.js:49](../../netlify/functions/admin-analytics.js#L49)).
- Refresh is authenticated before database access, requires exactly one named section, and refreshes only that business section; search is isolated ([admin-control-centre.js:330](../../netlify/functions/admin-control-centre.js#L330), [admin-control-centre.js:360](../../netlify/functions/admin-control-centre.js#L360)).
- Invalidation mapping is narrow and explicit for order, enquiry, and Search Console sources ([admin-control-centre.js:94](../../netlify/functions/admin-control-centre.js#L94)). Public lead persistence and checkout use the appropriate enquiry/order mappings ([contact-email.js:35](../../netlify/functions/contact-email.js#L35), [create-checkout.js:162](../../netlify/functions/create-checkout.js#L162)).
- The legacy analytics paths return `not_measured` without querying the database ([admin-analytics.js:60](../../netlify/functions/admin-analytics.js#L60)); the focused regression test verifies zero SQL calls ([admin-analytics.test.mjs:42](../../test/functions/admin-analytics.test.mjs#L42)).

## Critical

None found.

## Important

1. **Control-centre client still requests the removed `business` section and consumes the removed `data.business` key.** The server now accepts only `business_overview`, `sales_performance`, `orders`, `enquiries`, and `search` ([admin-control-centre.js:4](../../netlify/functions/admin-control-centre.js#L4), [admin-control-centre.js:360](../../netlify/functions/admin-control-centre.js#L360)). In contrast, the client type still permits only `'business' | 'search'` ([admin.service.ts:332](../../src/website/_services/admin.service.ts#L332)), `refresh()` posts `'business'` ([admin-control-centre.component.ts:86](../../src/website/_pages/admin/admin-control-centre/admin-control-centre.component.ts#L86)), and the component reads `data.business` ([admin-control-centre.component.ts:38](../../src/website/_pages/admin/admin-control-centre/admin-control-centre.component.ts#L38)). A valid authenticated UI refresh will return `400`; a successful new GET has `business_overview` instead, leaving the displayed overview unpopulated. Update the service contract/component to consume the separate snapshots and add a component/API-contract test that exercises refresh.

2. **Analytics UI was not migrated to the snapshot envelope or the intentional `not_measured` transition.** The endpoint maps `type=overview` to a `business_overview` cache response shaped as `{ status, data, cache }` ([admin-analytics.js:30](../../netlify/functions/admin-analytics.js#L30), [admin-analytics.js:49](../../netlify/functions/admin-analytics.js#L49)). The Angular page still treats the outer response as historic `{ kpis, leads }` and concurrently requests the retired breakdown modes ([admin-analytics.component.ts:40](../../src/website/_pages/admin/admin-analytics/admin-analytics.component.ts#L40), [admin-analytics.component.ts:44](../../src/website/_pages/admin/admin-analytics/admin-analytics.component.ts#L44), [admin-analytics.component.ts:59](../../src/website/_pages/admin/admin-analytics/admin-analytics.component.ts#L59)). It consequently renders all KPI values unavailable and presents intentional `not_measured` responses as empty lists rather than their explanation. Align it to `sales_performance`/`business_overview` snapshot data and render the server reason.

3. **A nonexistent order is treated as an order mutation and invalidates snapshots.** `admin-orders` performs an `UPDATE` without `RETURNING` or a row-count check, then always invalidates the order mapping and returns `200` ([admin-orders.js:66](../../netlify/functions/admin-orders.js#L66), [admin-orders.js:74](../../netlify/functions/admin-orders.js#L74)). This violates the narrow-invalidation rule by causing a stale/rebuild cycle when no state changed. The test reinforces this false positive: its SQL fake returns `[]` while it expects a successful update/invalidation ([admin-cache-invalidation.test.mjs:13](../../test/functions/admin-cache-invalidation.test.mjs#L13), [admin-cache-invalidation.test.mjs:22](../../test/functions/admin-cache-invalidation.test.mjs#L22)). Return the updated ID and respond `404` with no invalidation when absent, matching the enquiry handler’s behaviour.

## Minor

1. **Test-first evidence is not auditable.** The implementation report says the red command failed but provides no actual failure transcript, exit code, or failing test output ([business-cache-models-report.md:25](business-cache-models-report.md#L25)). The supplied diff shows the tests and implementation together, so it cannot establish that the new requirements failed before implementation. Preserve the real red output in the task evidence.

2. **The cents-revenue test proves SQL fragments rather than mixed-status behaviour.** It supplies an already-computed `revenue_cents` response and asserts query text ([admin-control-centre.test.mjs:89](../../test/functions/admin-control-centre.test.mjs#L89), [admin-control-centre.test.mjs:110](../../test/functions/admin-control-centre.test.mjs#L110)). It would still pass if the paid-status array accidentally included `pending`, `cancelled`, or `failed`. Add a database-backed/integration test with paid, pending, failed, cancelled, and `yoco_test` rows, asserting both the returned integer cents and paid count.

3. **No Angular regression test covers the changed server contract.** The control-centre component spec still fixtures the retired `business` section ([admin-control-centre.component.spec.ts:5](../../src/website/_pages/admin/admin-control-centre/admin-control-centre.component.spec.ts#L5)) and only tests status cards ([admin-control-centre.component.spec.ts:38](../../src/website/_pages/admin/admin-control-centre/admin-control-centre.component.spec.ts#L38)). There is no analytics component spec for the new envelope/`not_measured` state.

## Assessment

**Request changes before merge.** The server implementation and focused Node tests demonstrate the intended snapshot semantics, authentication gate, isolated invalidation mapping, and no-query legacy analytics transition. The actual administrative experience is nevertheless broken by an unupdated client contract, and the order mutation path invalidates when it made no change. No production database migration, authenticated browser test, Angular test run, or production build was evidenced in the supplied report; those remain unverified.

### Verification observed

Command run:

```text
npm run test:functions
```

Observed result: **107 passed, 0 failed, 0 skipped**. Node emitted the repository’s existing `MODULE_TYPELESS_PACKAGE_JSON` warnings. This confirms the current function suite only; it does not validate the missing Angular integration coverage or a live database migration.
