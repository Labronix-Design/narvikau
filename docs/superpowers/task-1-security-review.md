# Task 1 security review — server-side catalogue purchase contract

## Spec Compliance

Partially compliant. The cache resolves a public `purchaseMode` from the database-owned mode and integer-cent price; checkout fetches the authoritative product/accessory rows, rejects quote-only/non-positive selections before promo reservation, order creation, and Yoco, and returns a generic 422 response. The nullable migration preserves existing rows and the cache/checkout fallback is limited to a missing `purchase_mode` column (`42703`).

However, the implementation does not meet the reported requirement that admin writes accept only the two supported **non-null** modes: explicit `null` is accepted and can clear a quote-only classification. Also, the migration has not been applied to a target database and the changed admin write paths do not have the same pre-migration fallback as reads.

## Strengths

- `create-checkout` ignores browser-provided prices and modes, re-reads catalogue rows through parameterised tagged SQL, and validates every checkout path: products, standalone accessories, and configured accessories.
- The quote-only guard runs before coupon/promo capacity reservation, order creation, and the Yoco request. The endpoint exposes only a generic selection error plus `QUOTE_ONLY_ITEM`, not internal error details.
- The new migration is additive and nullable. The fallback rethrows all errors other than a specifically identified missing `purchase_mode` column, avoiding a broad error downgrade.
- Public catalogue reads remain read-only. `rebuildCatalogueReadModels` is referenced by admin mutation handlers; public read helpers do not seed or refresh the cache.
- The changed SQL uses Neon tagged-template parameters. No client-side secret or string-built SQL was introduced in the reviewed changes.

## Critical issues

None found.

## Important issues

1. **Explicit `null` can remove a quote-only restriction and make a positive-price item payable.**

   - Locations: `netlify/functions/admin-products.js:14`, `netlify/functions/admin-products.js:60`, `netlify/functions/admin-products.js:175`; `netlify/functions/admin-accessories.js:14`, `netlify/functions/admin-accessories.js:45`, `netlify/functions/admin-accessories.js:90`.
   - Concrete failure: an authenticated admin request can send `purchase_mode: null` while creating or updating an item with a positive authoritative price. `isPurchaseMode` treats `null` as valid and the update's `CASE` writes `NULL`. `resolvePurchaseMode` then treats the item as `online_checkout`, so an item deliberately marked `quote_only` can subsequently pass the server checkout guard and reach Yoco. This violates the stated non-null admin-mode contract and makes the purchase restriction vulnerable to a malformed admin client/request.
   - Fix: distinguish an omitted field from an explicitly supplied `null`. Reject explicit `null` and any non-allow-listed value. For a new item, either require one of the two string modes or derive and persist the concrete mode from the validated server-side price. For an update, allow omission only to preserve the existing legacy value; never permit a request to clear an existing mode to `NULL`. Add endpoint tests covering POST/PUT with `purchase_mode: null` against an existing positive-price `quote_only` record.

2. **Deploying functions before the database migration breaks all admin catalogue writes.**

   - Locations: `netlify/functions/admin-products.js:75`, `netlify/functions/admin-accessories.js:53`, `netlify/database/migrations/0011_catalogue_purchase_modes.sql:8`.
   - Concrete failure: the implementer reports that `0011_catalogue_purchase_modes.sql` was not applied. Before it is applied, either admin `POST`/`PUT` issues an `INSERT`/`UPDATE` containing `purchase_mode`; PostgreSQL returns `42703`, and the handler returns 500. Cache and checkout reads safely fall back, but admin mutations do not, so catalogue maintenance is unavailable during a functions-first rollout.
   - Fix: make applying migration 0011 to the production Netlify Database a release prerequisite before deploying these function changes, and verify it against that database. If independent function-first deployment must be supported, explicitly detect the missing column in admin writes and either use a legacy write that omits the field or return a deterministic migration-pending response without logging a raw database error. Do not allow an explicit positive-price quote-only item to be created until the schema exists.

## Minor issues

None found.

## Assessment

**Must not ship** until the two important issues are resolved: explicit `null` must not be able to clear a purchase restriction, and migration 0011 must be applied (or the admin mutation rollout made transition-safe) before these functions are deployed. No critical client-price, SQL-injection, public-cache-write, endpoint-error-leakage, or checkout quote-guard bypass was found in the reviewed diff.

## Re-review — fix round 1

Static review only; no tests were re-run.

1. **ADDRESSED — explicit `null` cannot reopen checkout.**

   - `netlify/functions/admin-products.js:14-15` and `netlify/functions/admin-accessories.js:14-15` now accept only exact allow-listed strings.
   - On create, `createdPurchaseMode` derives a concrete value only when the field is omitted (`admin-products.js:38-41`, `admin-accessories.js:38-41`); supplied `null` resolves to invalid and returns 400 before a write (`admin-products.js:103-104`, `admin-accessories.js:81-82`).
   - On update, an explicitly supplied `null` is rejected (`admin-products.js:178-179`, `admin-accessories.js:105-106`), while an omitted field preserves the stored mode (`admin-products.js:224`, `admin-accessories.js:133`). Therefore a positive-price `quote_only` row cannot be cleared to the legacy price fallback through these requests.

2. **ADDRESSED — pre-migration admin writes are transition-safe and migration-pending responses are generic.**

   - Both handlers retry only a specifically identified PostgreSQL missing `purchase_mode` column error (`admin-products.js:18-35`, `admin-accessories.js:18-35`) and rethrow unrelated failures.
   - On the legacy schema, a positive-price explicit `quote_only` write cannot fall back and instead raises the internal migration-pending sentinel (`admin-products.js:32-34`, `admin-accessories.js:32-34`). It is converted to a generic 503 response without database detail (`admin-products.js:278-283`, `admin-accessories.js:166-171`).
   - Other safe writes use the legacy query only after the expected 42703 condition (`admin-products.js:120-130`, `admin-accessories.js:92-96`; product update `:229-253`, accessory update `:138-151`).

3. **ADDRESSED — legacy cached payloads normalise without public cache writes.**

   - `normaliseCachedCataloguePayload` resolves the mode from the cached price and stored mode in memory (`netlify/functions/_catalogue-cache.js:22-32`).
   - Public reads only execute the `SELECT` and return the normalised result (`netlify/functions/_catalogue-cache.js:138-146`); cache `INSERT ... ON CONFLICT` remains confined to `rebuildCatalogueReadModels` (`:124-135`), which is used by admin mutation handlers.

No new client-price trust, SQL injection, cache-write authority, authentication/CORS, or error-exposure regression was identified in the fix diff.

### Re-review assessment

The two original important findings are addressed in code. Applying and verifying migration 0011 against the target Netlify Database remains a release prerequisite for persisting positive-price `quote_only` records, but functions-first deployment now fails closed for those writes rather than creating a payable legacy record.
