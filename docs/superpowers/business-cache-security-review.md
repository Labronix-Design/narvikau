# Business cache models — security review

## Scope and evidence

Read-only review of the supplied design, Task 3 implementation report, and
`task-3-review.diff`. Source locations below refer to the reviewed worktree
only to make the findings actionable. No code, database, configuration, or
external state was changed. Tests were not re-run as part of this security
review.

## Spec compliance

| Requirement | Result | Evidence |
| --- | --- | --- |
| Refresh and mutation require admin authentication | Pass | The control-centre handler verifies the admin token before database access and before GET, POST, or PUT processing; only non-mutating OPTIONS bypasses it. [`netlify/functions/admin-control-centre.js:324`](/Users/hannolabuschagne/Documents/GitHub/navrik/netlify/functions/admin-control-centre.js:324) |
| A client cannot rebuild a cache with GET or legacy analytics modes | Pass | GET only selects persisted snapshot/profile rows. Rebuilding is reachable only through an authenticated POST with one of the business section allowlist values; legacy analytics types return `not_measured` without a metrics query. [`netlify/functions/admin-control-centre.js:341`](/Users/hannolabuschagne/Documents/GitHub/navrik/netlify/functions/admin-control-centre.js:341) [`netlify/functions/admin-control-centre.js:360`](/Users/hannolabuschagne/Documents/GitHub/navrik/netlify/functions/admin-control-centre.js:360) [`netlify/functions/admin-analytics.js:60`](/Users/hannolabuschagne/Documents/GitHub/navrik/netlify/functions/admin-analytics.js:60) |
| Cache invalidation scope is exact | Pass | Orders map to overview/sales/orders; leads map to overview/sales/enquiries; Google maps only to search. The invalidation function additionally filters to the fixed section allowlist. [`netlify/functions/admin-control-centre.js:94`](/Users/hannolabuschagne/Documents/GitHub/navrik/netlify/functions/admin-control-centre.js:94) [`netlify/functions/admin-control-centre.js:105`](/Users/hannolabuschagne/Documents/GitHub/navrik/netlify/functions/admin-control-centre.js:105) |
| Revenue is paid/confirmed, cents output, excludes pending and tests | Pass | The revenue query restricts inclusion to the paid business statuses, excludes `yoco_test`, and emits a `BIGINT` cents value. The legacy decimal column is a final read-only fallback, consistent with the design's explicit legacy-compatibility exception. [`netlify/functions/admin-control-centre.js:186`](/Users/hannolabuschagne/Documents/GitHub/navrik/netlify/functions/admin-control-centre.js:186) |
| SQL is parameterised | Pass | Reviewed dynamic values, including cache sections, JSON payloads, profile data, and analytics section selection, are interpolation values of the Neon tagged-template API; no constructed SQL string was found in the reviewed change. [`netlify/functions/admin-control-centre.js:108`](/Users/hannolabuschagne/Documents/GitHub/navrik/netlify/functions/admin-control-centre.js:108) [`netlify/functions/admin-control-centre.js:301`](/Users/hannolabuschagne/Documents/GitHub/navrik/netlify/functions/admin-control-centre.js:301) [`netlify/functions/admin-analytics.js:51`](/Users/hannolabuschagne/Documents/GitHub/navrik/netlify/functions/admin-analytics.js:51) |
| CORS and errors do not disclose admin data or internals | Pass | The control-centre enables an origin only when it exactly equals its configured admin origin and returns generic errors for database/processing failures. Analytics no longer sends a wildcard origin and also returns generic failure data. [`netlify/functions/admin-control-centre.js:18`](/Users/hannolabuschagne/Documents/GitHub/navrik/netlify/functions/admin-control-centre.js:18) [`netlify/functions/admin-control-centre.js:374`](/Users/hannolabuschagne/Documents/GitHub/navrik/netlify/functions/admin-control-centre.js:374) [`netlify/functions/admin-analytics.js:74`](/Users/hannolabuschagne/Documents/GitHub/navrik/netlify/functions/admin-analytics.js:74) |
| Compatibility preserves history | Pass | The migration changes only the cache-section check constraint. It neither updates nor deletes historical orders, and the runtime compatibility fallback is read-only. [`netlify/database/migrations/0012_business_read_model_sections.sql:9`](/Users/hannolabuschagne/Documents/GitHub/navrik/netlify/database/migrations/0012_business_read_model_sections.sql:9) [`netlify/functions/admin-control-centre.js:190`](/Users/hannolabuschagne/Documents/GitHub/navrik/netlify/functions/admin-control-centre.js:190) |

## Strengths

- The authorization check precedes both cache reads and all cache/profile mutations, so an unauthenticated request cannot use a read path to force expensive recomputation.
- Cache section selection is a closed server-side map plus a second allowlist filter, preventing request data from selecting arbitrary cache rows.
- The analytics endpoint deliberately retires its live calculation modes rather than preserving a hidden bypass around the cached model.
- The money result remains integer cents. The fallback only reads legacy decimals for rows without the newer cents fields; it does not write or transform historical order data.

## Critical findings

None verified.

## Important findings

None verified.

## Minor findings

None verified in the reviewed Task 3 change.

## Assessment

**Passes this security/spec review.** The reviewed cached business read-model change meets the stated authentication, cache-isolation, CORS/error-handling, parameterisation, monetary-scope, compatibility, and migration-boundary requirements. This assessment does not replace the required test review; the implementation report records prior function-test results, but they were not independently executed here.
