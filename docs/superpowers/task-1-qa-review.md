# Task 1 QA review — server-side catalogue purchase contract

## Spec Compliance

- The migration is additive and nullable. It adds only `purchase_mode` columns and check constraints; it performs no update, delete, or backfill, so existing rows are preserved (`netlify/database/migrations/0011_catalogue_purchase_modes.sql:8`).
- The resolver implements the intended safe rule: null/invalid modes use the integer-cent price, zero/missing prices are quote-only, and an explicit `quote_only` overrides a positive price (`netlify/functions/_catalogue-cache.js:3`).
- Checkout reloads product and accessory data from the database and rejects an item before variants, promotions, reservations, order creation, and Yoco when the resolved mode is not `online_checkout` or its authoritative cents are non-positive (`netlify/functions/create-checkout.js:75`, `netlify/functions/create-checkout.js:135`). Client price and purchase-mode values are not used to authorise payment.
- The `42703` fallback is deliberately restricted to a missing `purchase_mode` column and retains price-based resolution (`netlify/functions/create-checkout.js:27`, `netlify/functions/_catalogue-cache.js:9`).
- Money remains in cents along these paths; price inputs are normalised with the existing integer-cent helper before checkout validation.

## Strengths

- The database constraint accepts exactly the two explicit purchase modes or null, preserving the legacy inference rule.
- The product quote-only test proves a positive-priced item cannot be progressed to option pricing (`test/functions/create-checkout.test.mjs:17`).
- The cache fallback test exercises both products and accessories against a simulated `42703` migration-order failure (`test/functions/catalogue-cache.test.mjs:37`).
- The current targeted suites were run fresh:

  `node --test test/functions/catalogue-cache.test.mjs test/functions/create-checkout.test.mjs`

  Result: 16 passed, 0 failed. Node emitted the pre-existing `MODULE_TYPELESS_PACKAGE_JSON` ESM warning for both function modules.

## Critical issues

None found.

## Important issues

1. **Pre-existing cached catalogue payloads can still lack `purchaseMode`.** `readCatalogueReadModel` returns the stored JSON payload without normalising it (`netlify/functions/_catalogue-cache.js:126`). The migration does not invalidate or rebuild the existing `products` and `accessories` read models, while public reads intentionally do not rebuild them. Thus cached payloads created before this change remain publicly served without the required property until an unrelated admin mutation happens to rebuild them. This conflicts with the requirement that every cached product/accessory exposes a resolved `purchaseMode`.

2. **The focused checkout tests do not cover the required quote-only accessory rejection paths.** The standalone-accessory test proves only that a positive legacy accessory can be priced from the database (`test/functions/create-checkout.test.mjs:153`); it never supplies a positive `purchase_mode: 'quote_only'` accessory and expects `QUOTE_ONLY_ITEM`. The configured-accessory scenario at `test/functions/create-checkout.test.mjs:84` similarly verifies server pricing only, not rejection of a positive quote-only selected accessory. The product, explicit positive quote-only product, and missing-column fallback cases are covered, but the standalone and accessory-selection cases are not. These are payment-authorisation boundaries and should be regression-tested directly.

## Minor issues

1. **The historical red phase is not independently auditable from the supplied evidence.** The report asserts initial failures at `docs/superpowers/task-1-report.md:29` and `docs/superpowers/task-1-report.md:33`, but does not retain the actual failing command output. The final green run is reproducible and was observed above; the claimed red runs cannot be validated after the implementation is present.

## Assessment

**Changes requested before approval.** The resolver and database checkout enforcement appear aligned with the contract and the targeted suites pass, but the stale cached-payload gap and untested quote-only accessory boundaries leave required behaviour unproven. Database application of the migration was not verified locally and remains outstanding as reported by the implementer.

## Scoped re-review — fix round 1

### Prior finding verdicts

1. **ADDRESSED — legacy cached-payload normalisation.** `normaliseCachedCataloguePayload` handles both `products` and `accessories`, selects the corresponding integer-cent field, and resolves a safe mode from the legacy item data (`netlify/functions/_catalogue-cache.js:22`). `readCatalogueReadModel` now applies it to stored payloads before returning a public response (`netlify/functions/_catalogue-cache.js:138`). The product legacy-cache regression test verifies a positive item becomes `online_checkout` and a zero-priced item becomes `quote_only` without a rebuild (`test/functions/catalogue-cache.test.mjs:57`).

2. **ADDRESSED — positive-priced quote-only accessory coverage.** The standalone accessory test supplies database `purchase_mode: 'quote_only'` and expects `QUOTE_ONLY_ITEM` (`test/functions/create-checkout.test.mjs:32`). The configured-accessory test does the same while the base product is an online-checkout product (`test/functions/create-checkout.test.mjs:47`). Each test's mocked database query throws if checkout progresses beyond the expected rejection, demonstrating the rejection occurs at catalogue resolution.

### New test/behaviour breakage

None identified in the supplied fix diff. The scoped changes also keep public reads side-effect free: normalisation is in memory only and does not rebuild or write the cache (`netlify/functions/_catalogue-cache.js:143`).

### Verification scope

No tests were re-run for this re-review, per the requested scope. The report's stated 24-pass result is implementer-provided evidence, not independently observed in this re-review. Netlify Database migration application remains unverified.

### Re-review assessment

The two original QA findings are **ADDRESSED**. No new issue is raised from the fix diff.
