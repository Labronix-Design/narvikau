# Task 1 — Server-side catalogue purchase contract

## Delivered

- Added `0011_catalogue_purchase_modes.sql`. It adds nullable `purchase_mode`
  columns with an allow-list constraint on `catalog_products` and
  `catalog_accessories`; it does not backfill, update, delete, or otherwise
  alter existing catalogue rows.
- Added `resolvePurchaseMode` to the catalogue cache. Cached `products` and
  `accessories` now expose only the resolved camel-case `purchaseMode`:
  `online_checkout` or `quote_only`. A missing/invalid mode resolves from the
  authoritative integer-cent price, so `price_cents <= 0` is quote-only.
- Checkout reads the database purchase mode and rejects every selected product,
  standalone accessory, and configured accessory when the resolved mode is not
  `online_checkout` or the authoritative price is non-positive. This happens
  before variant pricing, promo/coupon capacity, order creation, or Yoco. The
  internal validation error has code `QUOTE_ONLY_ITEM`; the handler returns a
  safe 422 response with the existing generic message and that code.
- Admin product/accessory create/update handlers accept only the two supported
  non-null modes, preserve an existing mode when the field is omitted on
  update, and retain their existing catalogue-cache rebuild calls. No Angular
  control was added.
- Public catalogue reads and checkout tolerate a temporarily not-yet-migrated
  schema: only PostgreSQL `42703` errors for `purchase_mode` retry their
  existing price-only query, yielding the same safe legacy resolution.

## Test-first evidence

1. `node --test test/functions/catalogue-cache.test.mjs` initially exited 1
   because `_catalogue-cache.js` did not export `resolvePurchaseMode`.
2. After adding the resolver/cache projection and migration, the same command
   passed: 3 tests, 0 failures.
3. `node --test test/functions/create-checkout.test.mjs` initially exited 1
   because `create-checkout.js` did not export `resolveCheckoutSelection`.
4. The first green attempt identified an async test-contract mismatch; the
   helper was made async and the focused suite then passed.
5. The migration-order fallback tests were each added red first:
   cache failed with PostgreSQL code `42703`, then passed after the cache
   fallback; checkout failed with the same code, then passed after the checkout
   fallback.

## Final verification

Command:

```sh
node --check netlify/functions/_catalogue-cache.js && node --check netlify/functions/create-checkout.js && node --check netlify/functions/admin-products.js && node --check netlify/functions/admin-accessories.js && node --test test/functions/catalogue-cache.test.mjs test/functions/create-checkout.test.mjs
```

Result: exit 0. `catalogue-cache.test.mjs`: 4 passed, 0 failed.
`create-checkout.test.mjs`: 12 passed, 0 failed. Node emitted the pre-existing
`MODULE_TYPELESS_PACKAGE_JSON` warning for ESM function files; no package
configuration was changed as part of this task.

`git diff --check` also exited 0.

## Migration compatibility and remaining verification

- Apply migration `0011_catalogue_purchase_modes.sql` before using an admin
  mutation to persist an explicit mode. Until then, cache and checkout safely
  fall back to the authoritative positive-price rule, but an admin create or
  update that references the new column needs the migration present.
- The migration runner/database was not available locally, so the SQL was not
  applied against Netlify Database in this task. The migration is additive,
  nullable, and includes rollback guidance in its header.
- No deployment, push, database mutation, production configuration change, or
  external API request was performed.
- Task-level security and QA review gates remain for the coordinating agent.

## Fix round 1 — review findings addressed

- Admin create requests now derive and persist a concrete mode from the
  validated integer-cent price when `purchase_mode` is omitted. Admin create
  and update requests reject an explicitly supplied `null` (or any other
  unsupported value) before making a database call; update omission alone
  preserves a stored modern-mode value.
- Product and accessory writes now detect only PostgreSQL `42703` errors that
  specifically name `purchase_mode`. Safe legacy writes retry without that
  column. A positive-price `quote_only` request cannot be represented by the
  legacy schema, so it returns a deterministic 503 migration-pending response
  instead of falling back to an online-checkout record. All unrelated database
  errors still rethrow to the existing generic 500 handling.
- `readCatalogueReadModel` now normalises legacy cached `products` and
  `accessories` in memory before returning them. This adds the resolved
  `purchaseMode` without writing or rebuilding cache data from a public read.
- Added regression coverage for explicit positive-price quote-only standalone
  accessories and configured accessories, along with product coverage already
  present. Added endpoint-level product/accessory tests for explicit null,
  omitted create mode derivation, safe pre-migration retry, and the
  migration-pending quote-only guard.

### Fix-round verification

Command:

```sh
node --check netlify/functions/_catalogue-cache.js && node --check netlify/functions/create-checkout.js && node --check netlify/functions/admin-products.js && node --check netlify/functions/admin-accessories.js && node --test test/functions/catalogue-cache.test.mjs test/functions/create-checkout.test.mjs test/functions/admin-catalogue-purchase-mode.test.mjs && git diff --check
```

Result: exit 0; 24 tests passed, 0 failed. The same pre-existing
`MODULE_TYPELESS_PACKAGE_JSON` ESM warning was emitted. No database migration,
deployment, push, or production configuration change was performed.

### Remaining compatibility note

Migration `0011_catalogue_purchase_modes.sql` is still not applied or verified
against Netlify Database locally. During a functions-first rollout, safe
legacy-mode writes remain available, while a positive-price quote-only admin
write intentionally returns 503 until the migration is applied; applying the
migration remains the release prerequisite for persisting that explicit mode.
