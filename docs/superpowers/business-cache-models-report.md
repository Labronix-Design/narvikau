# Business cache models report

## Status

Implemented the Task 3 server-side read-model boundary. Business overview, sales performance, orders, and enquiries are independently persisted cache sections. Revenue is an integer-cent measure of paid or confirmed receipts only; pending, failed, cancelled, and `yoco_test` orders are excluded. The historical decimal total is a read-only, final compatibility fallback for paid legacy rows only.

Order mutations invalidate `business_overview`, `sales_performance`, and `orders`. Lead mutations invalidate `business_overview`, `sales_performance`, and `enquiries`. Search remains isolated to the Google Search Console cache section. No public read route rebuilds a cache; stale and unavailable data return explicit `not_measured` states.

## Files

- `netlify/functions/admin-control-centre.js`
- `netlify/functions/admin-analytics.js`
- `netlify/functions/admin-orders.js`
- `netlify/functions/admin-queries.js`
- `netlify/functions/contact-email.js`
- `netlify/functions/quote-email.js`
- `netlify/functions/create-checkout.js`
- `netlify/functions/yoco-webhook.js`
- Checkout capacity is protected by read-time expiry views and the scoped
  checkout-time cleanup in `netlify/functions/create-checkout.js`; there is no
  periodic reservation reaper.
- `netlify/database/migrations/0012_business_read_model_sections.sql`
- `test/functions/admin-control-centre.test.mjs`
- `test/functions/admin-analytics.test.mjs`
- `test/functions/admin-cache-invalidation.test.mjs`
- `test/functions/public-lead-cache-invalidation.test.mjs`
- `test/functions/create-checkout.test.mjs`

## Tests

Red evidence was captured before the implementation with:

`node --test test/functions/admin-control-centre.test.mjs test/functions/admin-analytics.test.mjs`

It failed for the absent analytics handler, old single `business` invalidation, absent snapshot sections, and sales refresh reading `leads`.

Green verification:

`node --test test/functions/admin-control-centre.test.mjs test/functions/admin-analytics.test.mjs test/functions/admin-cache-invalidation.test.mjs test/functions/public-lead-cache-invalidation.test.mjs test/functions/create-checkout.test.mjs`

Result: 32 passed, 0 failed.

`npm run test:functions`

Result: 107 passed, 0 failed. `git diff --check` also passed.

## Concerns

- The functions test runner emits existing Node `MODULE_TYPELESS_PACKAGE_JSON` warnings because the repository uses ESM syntax without a package-level module type. No package configuration was changed in this task.
- The migration was created but not applied to a Netlify database. No production settings, deploy, push, or schema application was performed.
