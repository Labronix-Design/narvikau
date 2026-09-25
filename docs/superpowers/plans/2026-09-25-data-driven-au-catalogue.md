# Data-driven Navrik AU catalogue implementation plan

> **For implementers:** Use `superpowers:executing-plans` to carry out this plan task by task. The work is deliberately split between the Netlify/database and Angular owners. Do not deploy or apply the migration to production without a fresh, explicit user confirmation.

**Goal:** Keep the current four canopy entries as Navrik AU's initial catalogue while making products, categories, specifications and quote enquiries data-driven. An administrator must be able to add a future product category without an application-code change, and no payment capability may return.

**Architecture:** A forward-only database migration removes canopy-only constraints and adds a generic `specifications` JSONB field. The Netlify products API validates safe, generic catalogue data and rebuilds a generic public read model; it never accepts price, cart, checkout, or purchase fields. The Angular admin, storefront, detail, and quote flows consume that same generic contract, displaying the current canopy terminology only where it accurately describes the four current records.

**Stack:** Angular 21 standalone components and reactive forms, Node ESM Netlify Functions, `@neondatabase/serverless` tagged-template SQL, Netlify Database/Postgres, Node’s built-in test runner, Karma/Jasmine component tests.

## Scope and safeguards

- Preserve all currently deployed `catalog_products`, variants, warranties and leads. `0001_create-navrik-au-schema.sql` is immutable because it is already applied in production.
- Keep `netlify/assets/seed.mjs` as exactly the four existing canopy models. It is initial data, not an allowlist.
- Add no dependencies.
- Do not expose database or email secrets to the browser, commit them, or alter the existing `NETLIFY_DATABASE_URL`/`EMAIL_API_KEY` configuration.
- Keep all payment, cart, checkout, price and Yoco functionality absent. Reject such fields at the admin API boundary.
- Preserve historic `canopy_quote` leads while storing all new quote enquiries as `product_quote`.
- The production database migration and deploy are an external, irreversible action: request user confirmation after local verification and before running either.

## Task 1: Add a safe forward migration and extend the seed contract

**Files:**
- Create: `netlify/database/migrations/0002_generalise-catalogue-products.sql`
- Modify: `netlify/assets/seed.mjs`
- Modify: `test/functions/catalogue-cache.test.mjs`

1. Write the migration as an idempotent forward migration. Do not edit `0001`.
2. Drop only the `catalog_products` slug allowlist and single-category check created by `0001`; replace them with generic, database-level checks:
   - `slug` remains unique and nonempty and must use a lower-case URL-safe slug format (letters, digits and hyphens, with no leading/trailing or doubled hyphens).
   - `category` remains nonempty, lower-case and URL-safe, with no fixed category list.
3. Add `specifications JSONB NOT NULL DEFAULT '{}'::jsonb` with `CHECK (jsonb_typeof(specifications) = 'object')`. Backfill existing canopy data into a labelled object using the existing non-null canopy values (`Material`, `Thickness`, `Front door / window`, `Side door`, `Rear door`, and `Vehicle fit`).
4. Retain legacy canopy columns for backwards compatibility during this release, but remove their `NOT NULL` assumptions if any arise. New generic records must not require them.
5. Update the `leads.source` constraint using a named/recreated constraint so it permits `contact_form`, legacy `canopy_quote`, and new `product_quote`; it must not rewrite historical data.
6. Rebuild `catalogue_read_models.products` from the live active product rows at the end of the migration, so the next public read is coherent after deployment.
7. Keep the seed's four canopies and their visible canopy specifications. Populate `specifications` for each record and upsert it with the existing catalogue fields. Do not add a second category or a test product to production seed data.
8. Start with a failing cache test that includes a valid non-canopy product (for example, category `accessory`, safe slug, and `specifications`) and expects it in the read model. Also test that malformed categories/slugs and non-object specifications never become public payloads.

## Task 2: Generalise product validation, administration and cached storefront data

**Files:**
- Modify: `netlify/functions/admin-products.js`
- Modify: `netlify/functions/_catalogue-cache.js`
- Modify: `netlify/functions/catalog-storefront.js` only if its response typing/normalisation needs the new field
- Modify: `test/functions/admin-products.test.mjs`
- Modify: `test/functions/catalogue-cache.test.mjs`
- Modify: `test/functions/catalog-storefront.test.mjs`

1. Replace `CANOPY_SLUGS`, literal `category === 'canopy'`, and `WHERE category = 'canopy'` conditions with generic validation and queries.
2. In `admin-products.js`, use strict field allowlists that include `specifications` but still exclude every payment-related field (`price`, `price_cents`, `base_price`, `purchase_mode`, cart/checkout/Yoco fields). Validate:
   - required trimmed `name`, safe generic `slug`, and safe generic `category`;
   - boolean `is_active`, bounded integer `sort_order`, bounded gallery URL array;
   - `specifications` is a plain object with at most 30 entries, nonempty text labels and bounded string values; reject arrays, nested objects, control characters and prototype-shaped keys;
   - legacy canopy detail fields remain optional input fields for compatibility, but are neither required nor used as a category gate.
3. Select, insert and update the generic `specifications` column, and use product ID alone for generic updates/deletes. Continue using tagged-template SQL for every user-supplied value.
4. In `_catalogue-cache.js`, define a small generic public allowlist (`id`, `slug`, `name`, `category`, description/media/display fields, `specifications`, and variants only if already exposed). Normalise type and limits before serialising the cache. Build from every active `catalog_products` row ordered by `sort_order, name`; do not introduce a category table or separate cache section.
5. Preserve existing mutation behaviour: successful create/update/delete rebuilds the `products` read model and invalidates `catalogue:products` and `catalogue:storefront` tags.
6. Add failing tests before implementation for:
   - an authenticated admin creating an `accessory` product with a new slug and specifications;
   - editing and deleting that non-canopy product;
   - rejection before DB access of malformed slug/category/specifications and of price/purchase fields;
   - cached/public storefront output retaining the valid non-canopy fixture and stripping injected non-public/payment fields;
   - existing four canopy records continuing to appear.
7. Run `npm run test:functions` after the backend changes. Keep existing payment-field rejection coverage, renaming the tests to product terminology where useful.

## Task 3: Make quote validation, persistence and emails product-neutral

**Files:**
- Modify: `netlify/functions/_public-submission.js`
- Modify: `netlify/functions/quote-email.js`
- Modify: `test/functions/public-submission.test.mjs`
- Modify: existing quote-email function tests, or create `test/functions/quote-email.test.mjs` if none exists

1. Change the public quote contract from the canopy-only type string to a product-neutral type (`Product Quote Request`). Validate that exact type server-side and keep the strict public field allowlist and current rate-limiting controls.
2. Store new enquiries with source `product_quote`; use the same new source in the rate-limit key so product submissions retain their own safe limiter bucket. Historic `canopy_quote` rows remain readable.
3. Change customer/internal email subjects and copy from “Canopy Quote Request” to “Product Quote Request” / “product quote request,” retaining the selected product name and Navrik AU domain.
4. Keep the customer and recipient validation, persistence ordering, error handling and recipient configuration unchanged. This change must not introduce payment language or client-provided price data.
5. First add failing tests covering acceptance of a generic product request, rejection of the retired canopy type, persistence of `product_quote`, the correct rate-limit source, generic email copy, HTML escaping and no send when persistence fails.
6. Run the focused function tests and then `npm run test:functions`.

## Task 4: Use one generic catalogue model throughout Angular

**Files:**
- Modify: `src/website/_models/catalog.models.ts`
- Modify: `src/website/_services/admin.service.ts`
- Modify: `src/website/_services/product.service.ts` only where model handling requires it
- Modify: `src/website/_services/storefront-read-model.service.ts` only where response handling requires it
- Modify component specs that construct `CatalogProduct` fixtures

1. Add `specifications: Record<string, string>` to the storefront and admin product models. Keep legacy optional canopy fields temporarily so cached/server responses remain backwards compatible, but make no UI feature depend on them.
2. Add a shared front-end shape guard/helper (in the catalogue model file, if appropriate) that only accepts string-to-string specification entries. Do not trust arbitrary server JSON to be renderable.
3. Update existing test fixtures to include `specifications` and add an `accessory` fixture, confirming generic components/services accept both without a type cast.
4. Do not add product pricing, availability-to-buy, cart, or payment fields to any model or service.

## Task 5: Generalise the admin product editor

**Files:**
- Modify: `src/website/_pages/admin/admin-products/admin-products.component.ts`
- Modify: `src/website/_pages/admin/admin-products/admin-products.component.html`
- Modify: `src/website/_pages/admin/admin-products/admin-products.component.scss` only for necessary layout/accessibility support
- Modify/create: `src/website/_pages/admin/admin-products/admin-products.component.spec.ts`

1. Replace the fixed canopy form defaults and labels with generic required Name, Slug, Category, description/media/display controls plus a repeatable labelled specification editor.
2. Preserve the current admin table, active/sort controls, image and gallery support, variants and save/delete flows. The editor must allow adding/removing specification rows and must prevent blank/duplicate labels before submission.
3. Retire canopy-only form controls (`Front Door / Window`, `Side Door`, `Rear Door`, `Vehicle Fit`) from the generic editor. Existing canopy values appear via the new specifications map rather than special fields.
4. Use accessible labels and predictable controls. Do not hard-code the current canopy names or restrict Category to a dropdown; it is a validated text field because categories are data-driven.
5. Write component tests first for loading the four existing canopy products, editing their specifications, and creating a non-canopy category product with a new category. Verify no payment input/control is rendered or submitted.

## Task 6: Generalise storefront terminology, details and quote modal

**Files:**
- Modify: `src/website/_pages/products/products.component.ts`
- Modify: `src/website/_pages/products/products.component.html`
- Modify: `src/website/_pages/products/product-detail/product-detail.component.ts`
- Modify: `src/website/_pages/products/product-detail/product-detail.component.html`
- Modify: `src/website/_pages/main/main.component.ts`
- Modify: `src/website/_pages/main/main.component.html`
- Modify: `src/website/_components/quote-modal/quote-modal.component.ts`
- Modify: `src/website/_components/quote-modal/quote-modal.component.html`
- Modify: relevant `.spec.ts` files

1. Keep the existing card/detail layout and routing. Derive visible category copy from each product's category (for example, `Canopies` for current records), with a safe title-cased fallback for future categories. The page title/empty state must say “Products”, not imply that only canopies can exist.
2. Render product detail specifications by iterating the validated `specifications` entries. Omit the section cleanly if an older product has none. Remove the fixed six-row canopy specification presentation.
3. Rename presentational copy such as “Canopy catalogue preview” and canopy-only quote buttons to product-neutral wording where it is a site-wide concept. Do not change current canopy product names, content or visual formatting.
4. Update the quote modal to submit `Type: 'Product Quote Request'`, use the selected product name when available and a neutral “Product enquiry” fallback. Keep all existing client-side validation, success/error UX, submission endpoint, and no-payment behaviour.
5. Write/update tests first proving a non-canopy product card opens a quote request, the request body uses the generic type, detail renders arbitrary labelled specs, canopy fixtures still render correctly, and no price/purchase controls appear.

## Task 7: Local regression verification and review gates

**Files:**
- Modify only tests/documentation required by verified results; no production artifacts.

1. Run, in order:
   - `npm run test:functions`
   - the relevant Angular/Karma component specs (or the configured focused alternative if the workspace lacks an Angular test target)
   - `npm run build`
2. Exercise the local Netlify/API path if available. At minimum, use test doubles to prove the complete non-canopy path: admin product create → cached read model rebuild → `/api/catalog-storefront` response → generic quote validation/persistence/email payload.
3. Search the changed source and generated bundle for payment regressions: payment gateway, checkout, cart, Yoco, and price/purchase fields. The only allowed matches are intentional server-side rejection tests/docs; none may be usable site functionality.
4. Ask the `security-auditor` to review the database migration, environment access and HTTP changes. Resolve any critical/high finding and repeat the review.
5. Ask the `qa-tester` to validate the new tests (including a test that fails before the implementation) and the full verification results. Resolve failures and rerun the affected checks.
6. Report actual commands/results and any limitation candidly. Do not call the work complete merely because it compiles.

## Task 8: Production release only after renewed approval

**Files:**
- No source changes expected.

1. Present the migration name, deployment diff/commit and Task 7 results to the user, and obtain a fresh explicit confirmation to alter the live database and deploy.
2. With approval, link/verify the `navrikau` Netlify site, dry-run the pending migration, apply `0002_generalise-catalogue-products.sql`, then run the existing seed only if it is required to populate the new specification JSON (it must still result in exactly four initial canopy products).
3. Deploy the verified production build and confirm the published deploy is ready.
4. Verify live, without disclosing secrets:
   - `/api/catalog-storefront` returns the four existing canopy products with `specifications` and no price/purchase fields;
   - admin can create, update and delete a non-canopy test product, its cache rebuilds and storefront renders it; remove that test record recoverably through the admin endpoint before handoff;
   - a generic product quote persists with source `product_quote` and sends the expected generic emails;
   - public site remains payment-free.
5. If migration/deploy/live verification fails, stop, preserve diagnostic output without secrets, and report the exact failure and rollback/recovery state.

## Completion criteria

- An administrator can add a product in a new category with a unique valid slug and arbitrary labelled specifications, and it appears in the storefront/read model without a code change.
- The seed/live initial catalogue remains exactly the four current canopy products; no artificial non-canopy catalogue content is left in production.
- Canopy records display as before in the same visual format, using data-backed generic specifications.
- Product quote requests are generic and new leads use `product_quote`; historic data is preserved.
- There is no visible or operational payment, checkout, cart, Yoco, price or purchase capability.
- Unit/function tests, build, QA review and security review have completed successfully; production work happens only after fresh approval.
