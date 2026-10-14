# Navrik AU Navrik-standard parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AU catalogue, enquiries and Admin workflows follow Navrik’s established standard while remaining quote-only and initially publishing only Canopies.

**Architecture:** Add a managed category read model and a forward-only category/product relationship, then make both the storefront and Admin consume it. Extend the lead contract from the normal Navrik patterns with AU location/referral data and explicit enquiry types, preserving historic leads and existing email recipients.

**Tech Stack:** Angular 21 standalone components/reactive forms, Netlify Functions (Node ESM), Netlify Database/Postgres via `@neondatabase/serverless`, Node built-in test runner, Karma/Jasmine, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-14-navrik-au-navrik-standard-parity-design.md`

## Global Constraints

- The current Meta Pixel implementation is correct and frozen. Do not change its ID, consent handling, event behaviour, CSP entries, tests, or settings.
- Do not add payment, pricing, cart, checkout, orders, payment webhooks, or purchase-specific accessory functionality.
- Keep the current AU mail recipients, including Labronix, intact.
- Use `navrik.co.za` as the workflow and design reference, adapting terminology, locations, email/domain identity, and copy for Australia only.
- Use a new forward-only migration; never edit applied migrations `0001` or `0002`.
- Add no dependency. Parameterise all SQL and keep environment variables server-only.
- Push, production migration, and deployment require a separate current user confirmation.

## Review Focus

- A product pointing at an unknown or inactive category is rejected before it can enter the public read model — Task 2 API tests.
- A deletion request for a category with products returns a safe conflict and retains both category and products — Task 2 API tests.
- Forged public enquiry/source/type fields, invalid Australian locations, and missing conditional referral detail are rejected without persistence — Task 4 function tests.
- A valid dealer or fitment enquiry persists its own enquiry type, but customer data cannot overwrite a trusted lead type — Task 4 function tests.
- SVG/GIF and over-size image uploads are rejected in the client with a meaningful error while JPEG/PNG/WebP proceed to the current secure endpoint — Task 6 component tests.

---

### Task 1: Forward migration and category-aware public read model

**Files:**
- Create: `netlify/database/migrations/0003_navrik-standard-catalogue-and-leads.sql`
- Modify: `netlify/functions/_catalogue-cache.js`
- Modify: `netlify/functions/catalog-storefront.js`
- Create: `netlify/functions/catalog-categories.js`
- Modify: `src/website/_models/catalog.models.ts`
- Modify: `src/website/_services/storefront-read-model.service.ts`
- Test: `test/functions/catalogue-cache.test.mjs`
- Test: `test/functions/catalog-storefront.test.mjs`
- Create: `test/functions/catalog-categories.test.mjs`
- Test: `test/catalog-models.test.mts`

**Interfaces:**
- Produces `CatalogCategory { id: number; slug: string; name: string; description: string | null; sort_order: number }` and `StorefrontReadModel.categories: CatalogCategory[]`.
- Produces `normaliseCatalogueCategories(payload): CatalogCategory[]`, `rebuildCatalogueReadModels(sql, ['products', 'categories'])`, and the anonymous `GET /api/catalog-categories` response.
- Consumes existing generic product fields and `catalogue_read_models` cache semantics.

- [ ] **Step 1: Write failing cache/model tests for an active Canopies category and an inactive category**

Add fixtures asserting only safe, active categories enter the `categories` read model; products in an inactive category do not enter the public product model; malformed category payloads normalise to an empty list.

- [ ] **Step 2: Run the focused cache/model tests to verify they fail**

Run: `node --test test/functions/catalogue-cache.test.mjs test/functions/catalog-storefront.test.mjs test/functions/catalog-categories.test.mjs`

Expected: FAIL because `categories` is not a supported cached section or storefront property.

- [ ] **Step 3: Implement migration `0003_navrik-standard-catalogue-and-leads.sql`**

Create `catalog_categories` with unique URL-safe `slug`, name, nullable description, `sort_order`, `is_active`, timestamps, and the necessary checks. Seed only `canopy`/Canopies; add a foreign key from `catalog_products.category` to `catalog_categories.slug` with `ON UPDATE CASCADE` and restrictive deletion. Add nullable `leads.enquiry_type`, `location_state`, `location_suburb`, `discovery_source`, and `discovery_source_detail` columns; extend the trusted source constraint for `contact_form`, `product_quote`, `partner_form`, and `manual`; preserve historic rows. Populate/refresh both `products` and `categories` cache rows without editing earlier migrations.

- [ ] **Step 4: Extend the cache and anonymous catalogue handlers**

Implement `normaliseCatalogueCategories(payload)`, add `categories` to the cache section allowlist/builders, build public products by joining active categories, and expose categories in `GET /api/catalog-storefront`. Implement `catalog-categories.js` as a read-only cached category endpoint with the same CORS/error policy as `catalog-products.js`.

- [ ] **Step 5: Extend the Angular read-model types and normalisation**

Add `CatalogCategory` and `categories` to the shared model/service, with a defensive category shape guard equivalent to existing product/specification guards. Preserve old product URLs and avoid adding commerce fields.

- [ ] **Step 6: Run focused tests to verify they pass**

Run: `node --test test/functions/catalogue-cache.test.mjs test/functions/catalog-storefront.test.mjs test/functions/catalog-categories.test.mjs test/catalog-models.test.mts`

Expected: PASS with active-category-only storefront payloads.

- [ ] **Step 7: Commit the migration and public read-model slice**

```bash
git add netlify/database/migrations/0003_navrik-standard-catalogue-and-leads.sql netlify/functions/_catalogue-cache.js netlify/functions/catalog-storefront.js netlify/functions/catalog-categories.js src/website/_models/catalog.models.ts src/website/_services/storefront-read-model.service.ts test/functions/catalogue-cache.test.mjs test/functions/catalog-storefront.test.mjs test/functions/catalog-categories.test.mjs test/catalog-models.test.mts
git commit -m "feat: add managed AU catalogue categories"
```

### Task 2: Secure category management and linked product administration

**Files:**
- Create: `netlify/functions/admin-categories.js`
- Modify: `netlify/functions/admin-products.js`
- Test: `test/functions/admin-categories.test.mjs`
- Test: `test/functions/admin-products.test.mjs`

**Interfaces:**
- Consumes `catalog_categories` and Task 1 cache functions.
- Produces authenticated `GET|POST|PUT|DELETE /api/admin-categories` and category-validated product create/update operations.
- Category request shape: `{ id?, slug, name, description?, sort_order?, is_active? }`; product category remains a slug selected from an active category.

- [ ] **Step 1: Write failing category-admin tests**

Cover unauthenticated rejection; strict request-field validation; create/update/list; duplicate/malformed slug rejection; a referenced-category delete returning `409`; and cache rebuild/purge for both products and categories.

- [ ] **Step 2: Add failing product-category tests**

Assert product create/update rejects unknown and inactive category slugs before insert/update, accepts `canopy`, and rebuilds both cache sections after a successful mutation.

- [ ] **Step 3: Run focused tests to verify they fail**

Run: `node --test test/functions/admin-categories.test.mjs test/functions/admin-products.test.mjs`

Expected: FAIL because the category endpoint and category existence checks do not exist.

- [ ] **Step 4: Implement `createAdminCategoriesHandler` with strict validation**

Use the normal Navrik category workflow, but enforce the AU request allowlist, length limits, URL-safe slugs, parameterised SQL, authenticated methods, `409` on FK-protected deletion, and rebuild/purge of `['products', 'categories']` after mutation. Do not use Navrik’s product/accessory type or commerce fields.

- [ ] **Step 5: Require an active matching category in `createAdminProductsHandler`**

Look up the validated category slug before insert/update; return a client-safe validation error if absent/inactive; rebuild both catalogue sections after a product mutation. Retain strict product field allowlists and gallery/specification protections.

- [ ] **Step 6: Run focused tests to verify they pass**

Run: `node --test test/functions/admin-categories.test.mjs test/functions/admin-products.test.mjs`

Expected: PASS, including the referenced-category deletion conflict test.

- [ ] **Step 7: Commit the secured category/product APIs**

```bash
git add netlify/functions/admin-categories.js netlify/functions/admin-products.js test/functions/admin-categories.test.mjs test/functions/admin-products.test.mjs
git commit -m "feat: manage linked catalogue categories"
```

### Task 3: Admin category UI and category-driven AU catalogue

**Files:**
- Create: `src/website/_pages/admin/admin-categories/admin-categories.component.ts`
- Create: `src/website/_pages/admin/admin-categories/admin-categories.component.html`
- Create: `src/website/_pages/admin/admin-categories/admin-categories.component.scss`
- Create: `src/website/_pages/admin/admin-categories/admin-categories.component.spec.ts`
- Modify: `src/website/_services/admin.service.ts`
- Modify: `src/website/website.routes.ts`
- Modify: `src/website/_pages/admin/admin-shell.component.ts`
- Modify: `src/website/_pages/admin/admin-shell.component.html`
- Modify: `src/website/_pages/admin/admin-shell.component.spec.ts`
- Modify: `src/website/_pages/admin/admin-products/admin-products.component.ts`
- Modify: `src/website/_pages/admin/admin-products/admin-products.component.html`
- Modify: `src/website/_pages/admin/admin-products/admin-products.component.spec.ts`
- Modify: `src/website/_pages/main/main.component.ts`
- Modify: `src/website/_pages/main/main.component.html`
- Modify: `src/website/_pages/products/products.component.ts`
- Modify: `src/website/_pages/products/products.component.html`
- Modify: `src/website/_pages/products/products.component.spec.ts`
- Modify: `src/website/_pages/products/product-detail/product-detail.component.html`
- Modify: `src/website/_pages/products/product-detail/product-detail.component.spec.ts`

**Interfaces:**
- Consumes `AdminService.getCategories()`, `createCategory()`, `updateCategory()`, `deleteCategory()`, `CatalogCategory[]`, and storefront `categories` from Tasks 1–2.
- Produces `/admin/categories`; category selection in the product editor; category-derived public sections and generic product terminology.

- [ ] **Step 1: Write failing Admin service/component tests**

Define AdminService category methods against `/api/admin-categories`. Test the category page lists, creates, edits, toggles active status and surfaces a deletion conflict; test the product form renders an active-category selector and cannot submit an unselected category.

- [ ] **Step 2: Run the Admin component tests to verify they fail**

Run the repository’s configured focused Karma/Jasmine command for the three affected Admin specs; if no executable Karma target exists, record that limitation and run the TypeScript/build check after implementation.

Expected: FAIL because the route, methods, component, and selector do not exist.

- [ ] **Step 3: Implement Navrik-standard category administration**

Add the Admin route/navigation entry labelled “Categories”, matching current Admin styling and accessibility conventions. Wire the component to the strict API and show meaningful server validation/deletion messages.

- [ ] **Step 4: Replace the product category free-text field with a managed selector**

Load active categories through AdminService, preserve a product’s current category while editing, prevent save when no active category is selected, and keep the cover/gallery/specification controls unchanged.

- [ ] **Step 5: Render public catalogue sections from read-model categories**

Replace the fixed `canopy` home lane, “Aluminium Canopies” page copy, canopy-only empty/error states, and generic detail labels with data-derived category names. Keep current Canopies data and the existing product routes/layout; do not add a separate accessories purchase experience.

- [ ] **Step 6: Run focused UI tests and build**

Run the affected component tests and `npm run build`.

Expected: PASS and build success; only Canopies render with the current seed.

- [ ] **Step 7: Commit the category-driven Admin and storefront UI**

```bash
git add src/website/_pages/admin src/website/_services/admin.service.ts src/website/website.routes.ts src/website/_pages/main src/website/_pages/products
git commit -m "feat: drive AU catalogue from managed categories"
```

### Task 4: Trusted AU enquiry contract, persistence and manual leads

**Files:**
- Create: `netlify/functions/_enquiry-details.js`
- Modify: `netlify/functions/_public-submission.js`
- Modify: `netlify/functions/contact-email.js`
- Modify: `netlify/functions/quote-email.js`
- Create: `netlify/functions/partner-email.js`
- Modify: `netlify/functions/admin-queries.js`
- Create: `test/functions/admin-queries.test.mjs`
- Modify: `test/functions/public-submission.test.mjs`
- Create: `test/functions/contact-email.test.mjs`
- Create: `test/functions/quote-email.test.mjs`
- Create: `test/functions/partner-email.test.mjs`

**Interfaces:**
- Produces `ENQUIRY_TYPES = ['product_quote', 'general_contact', 'dealer_enquiry', 'fitment_enquiry']`, `AU_STATES_AND_TERRITORIES`, and `validateEnquiryDetails(payload)`.
- Public contact/quote inputs accept `LocationState`, `LocationSuburb`, `DiscoverySource`, and `DiscoverySourceDetail`; server-owned handlers assign source and enquiry type. `POST /api/partner-email` accepts only a validated dealer/fitment selection and derives `partner_form` as its source.
- Produces authenticated `POST /api/admin-queries` for manual lead creation while retaining `GET` and status/notes `PUT`.

- [ ] **Step 1: Write failing validation and email/persistence tests**

Test accepted AU state/territory + non-empty locality, the normal Navrik referral list and required detail cases, rejected forged `source`/`enquiry_type`, corrected `Type: 'Product Quote Request'`, and `POST /api/partner-email` accepting only dealer/fitment values. Assert lead persistence of trusted type/detail fields, HTML-escaped emails, preserved recipient configuration, and no email if persistence fails.

- [ ] **Step 2: Write failing manual-lead endpoint tests**

Cover authenticated `POST` with each allowed enquiry type; rejection of unknown fields/type/location; `GET` filters for enquiry type/status; and update protection so public lead capture details cannot be overwritten by the status/notes endpoint.

- [ ] **Step 3: Run focused function tests to verify they fail**

Run: `node --test test/functions/public-submission.test.mjs test/functions/contact-email.test.mjs test/functions/quote-email.test.mjs test/functions/partner-email.test.mjs test/functions/admin-queries.test.mjs`

Expected: FAIL because structured fields, trusted types, and manual POST do not exist.

- [ ] **Step 4: Implement shared AU enquiry validation**

Create `_enquiry-details.js` with bounded text validation, the Australian state/territory allowlist, locality/referral rules, and a formatted safe representation for email/lead display. Keep public field allowlists strict and do not trust source/type submitted by browsers.

- [ ] **Step 5: Persist and email trusted enquiry details**

Make contact handlers derive `contact_form`/`general_contact`; quote handlers derive `product_quote`/`product_quote`; and the new partner handler derives `partner_form` plus validated `dealer_enquiry` or `fitment_enquiry`. Persist the new columns, include useful details in internal/customer email rows, retain existing recipients (including Labronix) and AU domain identity, and preserve rate limits/persistence-before-email sequencing.

- [ ] **Step 6: Implement Navrik-standard manual lead creation and filtering**

Extend `admin-queries.js` with strict authenticated POST parsing, parameterised insert, control-centre invalidation, list filters for `enquiry_type`/status, and the existing narrow PUT status/notes surface. Never expose customer email API keys or recipient configuration.

- [ ] **Step 7: Run focused function tests to verify they pass**

Run: `node --test test/functions/public-submission.test.mjs test/functions/contact-email.test.mjs test/functions/quote-email.test.mjs test/functions/partner-email.test.mjs test/functions/admin-queries.test.mjs`

Expected: PASS, including the existing quote-modal request type correction.

- [ ] **Step 8: Commit the AU lead contract**

```bash
git add netlify/functions/_enquiry-details.js netlify/functions/_public-submission.js netlify/functions/contact-email.js netlify/functions/quote-email.js netlify/functions/partner-email.js netlify/functions/admin-queries.js test/functions/public-submission.test.mjs test/functions/contact-email.test.mjs test/functions/quote-email.test.mjs test/functions/partner-email.test.mjs test/functions/admin-queries.test.mjs
git commit -m "feat: capture and manage AU enquiry details"
```

### Task 5: Public AU forms and Admin enquiry workflow

**Files:**
- Create: `src/website/_models/enquiry-source.models.ts`
- Create: `src/website/_models/enquiry-location.models.ts`
- Create: `src/website/_components/enquiry-location/enquiry-location.component.ts`
- Create: `src/website/_components/enquiry-location/enquiry-location.component.html`
- Create: `src/website/_components/enquiry-location/enquiry-location.component.scss`
- Create: `src/website/_components/enquiry-location/enquiry-location.component.spec.ts`
- Modify: `src/website/_components/quote-modal/quote-modal.component.ts`
- Modify: `src/website/_components/quote-modal/quote-modal.component.html`
- Modify: `src/website/_components/quote-modal/quote-modal.component.spec.ts`
- Modify: `src/website/_pages/contact/contact.component.ts`
- Modify: `src/website/_pages/contact/contact.component.html`
- Modify: `src/website/_pages/contact/contact.component.spec.ts`
- Modify: `src/website/_pages/main/main.component.ts`
- Modify: `src/website/_pages/main/main.component.html`
- Modify: `src/website/_pages/main/main.component.spec.ts`
- Modify: `src/website/_pages/admin/admin-queries/admin-queries.component.ts`
- Modify: `src/website/_pages/admin/admin-queries/admin-queries.component.html`
- Modify: `src/website/_pages/admin/admin-queries/admin-queries.component.scss`
- Modify: `src/website/_services/admin.service.ts`

**Interfaces:**
- Consumes `ENQUIRY_SOURCE_OPTIONS`, `sourceRequiresDetail`, `sourceDetailRequiredValidator`, `EnquiryLocationSelection`, and the Task 4 public/admin API contracts.
- Produces consistent `LocationState`, `LocationSuburb`, `DiscoverySource`, `DiscoverySourceDetail` fields in quote/contact/home submissions and `AdminService.createQuery()`/filtered `getQueries()`.

- [ ] **Step 1: Write failing reactive-form/component tests**

Test state/territory and locality selection, conditional referral detail validation, `Product Quote Request` submission, contact payload fields, a dealer/fitment home form requiring business name/type, success-only lead event behaviour without modifying Meta Pixel configuration, and manual-lead creation/filtering in Admin.

- [ ] **Step 2: Run focused form/component tests to verify they fail**

Run the configured focused Karma/Jasmine tests for enquiry location, quote modal, contact, home, and admin queries; record any test-runner limitation truthfully.

Expected: FAIL because common AU location/referral controls and manual entry do not exist.

- [ ] **Step 3: Implement shared AU enquiry form building blocks**

Port the normal Navrik component/model pattern, changing only country-specific labels/options. Use Australian state/territory and suburb/locality labels; keep referral choices and conditional-detail logic from Navrik.

- [ ] **Step 4: Apply the shared fields to public forms**

Update contact and quote forms to send the Task 4 contract. Replace the home canopy enquiry with a clearly labelled dealer/fitment partner enquiry, business name field, dealer/fitment type control, and the dedicated `/api/partner-email` endpoint. Keep visual structure and the existing success-only Meta lead call untouched.

- [ ] **Step 5: Add the manual lead UI and enquiry filters**

Follow the normal Navrik Admin workflow for a creation form and enquiry type/status filters. Display location, referral, product, type, notes and status without exposing unnecessary customer data in list views.

- [ ] **Step 6: Run focused UI tests and build**

Run the affected component tests and `npm run build`.

Expected: PASS with the public and manual lead workflows compiling against the new API.

- [ ] **Step 7: Commit the public/Admin enquiry UI**

```bash
git add src/website/_models/enquiry-source.models.ts src/website/_models/enquiry-location.models.ts src/website/_components/enquiry-location src/website/_components/quote-modal src/website/_pages/contact src/website/_pages/main src/website/_pages/admin/admin-queries src/website/_services/admin.service.ts
git commit -m "feat: add AU enquiry and partner workflows"
```

### Task 6: Upload accuracy and question-mark display repair

**Files:**
- Modify: `src/website/_components/image-upload/image-upload.component.ts`
- Modify: `src/website/_components/image-upload/image-upload.component.html`
- Create: `src/website/_components/image-upload/image-upload.component.spec.ts`
- Modify: `src/assets/icons/icon-registry.ts`
- Modify: `test/icons/icon-registry.test.mjs`

**Interfaces:**
- Consumes the existing `POST /api/admin-upload` policy: JPEG/PNG/WebP, maximum 4 MiB.
- Produces client errors that preserve safe server messages where available and icon registry entries for `login`, `event`, and `notifications`.

- [ ] **Step 1: Write failing upload/icon tests**

Assert `accept="image/jpeg,image/png,image/webp"`; client rejection of SVG/GIF/oversize input without upload; server-provided validation text is shown on failed upload; valid WebP invokes `uploadImage`; and every referenced known icon has a registered SVG.

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `node --test test/icons/icon-registry.test.mjs` and the configured focused image-upload component spec.

Expected: FAIL because the picker currently advertises generic images/GIF/SVG and the three icon keys are absent.

- [ ] **Step 3: Align upload UI with the existing secure server policy**

Use explicit MIME checks and accept values for JPEG/PNG/WebP, retain the 4 MiB client guard, update visible help text, and surface a bounded server error message. Do not relax or duplicate unsafe server acceptance.

- [ ] **Step 4: Register and verify the missing icons**

Add safe SVG definitions for `login`, `event`, and `notifications`; scan template/data icon references and correct only verified missing registry entries.

- [ ] **Step 5: Run focused tests and a browser visual audit**

Run the Task 6 tests, then inspect the public pages and Admin pages that previously referenced missing icons. Record each found defect and its resolution; do not change the frozen Meta Pixel files/settings.

- [ ] **Step 6: Commit display and upload repairs**

```bash
git add src/website/_components/image-upload src/assets/icons/icon-registry.ts test/icons/icon-registry.test.mjs
git commit -m "fix: align uploads and restore admin icons"
```

### Task 7: Integration verification and mandatory review gate

**Files:**
- Modify: only test/report files required to record actual verification results.

**Interfaces:**
- Consumes complete Tasks 1–6 and produces verified commit(s) ready for a user-approved release.

- [ ] **Step 1: Run the full function regression suite**

Run: `npm run test:functions`

Expected: PASS. Investigate and fix any regression; do not weaken tests.

- [ ] **Step 2: Run the production build and static scope checks**

Run: `npm run build`

Then inspect the implementation diff for changes to Meta Pixel files/ID/CSP/consent and for any cart, checkout, payment, price or Yoco additions.

Expected: build PASS; no Meta Pixel change; no operational commerce additions.

- [ ] **Step 3: Run browser acceptance checks against the local Netlify path**

Verify category create/edit/product selection, category-based public display, quote/contact/dealer/fitment submit success paths, manual lead filtering, accepted/rejected image selection, gallery handling, and repaired visible icons. Do not use real email recipients or production data.

- [ ] **Step 4: Run the security review gate**

Ask `security-auditor` to review the migration, database constraints, category/admin/enquiry endpoints, environment access, data validation, email handling, and changed HTTP surfaces. Resolve high/critical findings and obtain a re-check.

- [ ] **Step 5: Run the QA review gate**

Ask `qa-tester` to verify test-first coverage and the actual suite/build/browser results. Resolve failing tests and re-run the affected checks.

- [ ] **Step 6: Commit verification documentation if it changed, then report results**

```bash
git status --short
git add <only-verified-report-files>
git commit -m "test: verify AU catalogue and enquiry parity"
```

Report commands and real outcomes, including any framework-test limitation. Do not push, migrate production, or deploy without a new user confirmation.

## Completion criteria

- Admin manages categories and products are linked to valid managed categories.
- Only Canopies initially publish, while new future categories require no code change.
- Public pages use data-driven catalogue terminology and retain current product URLs/gallery functionality.
- Product quote, general contact, dealer and fitment-centre requests capture AU location/referral data and enter one filterable Admin workflow.
- Manual lead creation works without weakening public-lead validation.
- Upload guidance matches actual server policy and known missing icons are repaired.
- Meta Pixel code and configuration are unchanged.
- Function tests, production build, focused browser checks, security review and QA review have passed before a release is proposed.
