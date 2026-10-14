# Navrik AU catalogue and enquiry parity design

## Purpose

Bring Navrik Australia up to the established `navrik.co.za` operating standard
for catalogue administration and lead handling. The AU site remains a
quote-only website with only the existing Canopies catalogue data at launch.
It must be ready for additional product categories without code changes.

## Scope guard

- The current Meta Pixel implementation is correct and frozen. Do not change
  its ID, consent handling, event behaviour, CSP entries, tests, or settings.
- Do not add payment, pricing, cart, checkout, orders, payment webhooks, or
  purchase-specific accessory functionality.
- Keep the current AU mail recipients, including Labronix, intact.
- Use `navrik.co.za` as the workflow and design reference, adapting terminology,
  locations, email/domain identity, and copy for Australia only.

## Catalogue model

### Categories

Introduce a managed `catalog_categories` entity modelled on Navrik's category
administration. Each category has a stable slug, name, optional description,
sort order, and active state.

The forward migration seeds exactly one active category: `canopy` / Canopies.
It does not add accessories or test products. Existing products remain linked
to that category.

Products retain their generic category slug, but the database and admin API
must require a matching managed category. A category with assigned products
cannot be deleted. It may be made inactive or products may first be reassigned.

### Public catalogue

The public storefront read model exposes active categories and active products.
The home catalogue, products list, navigation, metadata, headings, category
sections and empty states consume this model rather than a global canopy
constant. Current records consequently still render in a Canopies section;
future categories render without application code changes.

Product detail remains the existing route and layout, but uses generic product
terminology and data-backed specifications. Existing product URLs, imagery,
primary cover image, and gallery support stay intact.

### Administration

Add the Navrik-standard Categories page, route, service calls and Admin
navigation entry. The Product editor uses a managed category selection rather
than free-text input. It keeps the existing generic product, primary image and
gallery workflow, including its 30 supplementary-image limit.

## Enquiries and lead handling

All public lead capture uses the normal Navrik validation and formatting
pattern, adapted for Australian states/territories and suburb/locality labels.

The quote modal, contact page and home partner form capture:

- customer or business details;
- state/territory and suburb/locality;
- referral source and conditional referral detail;
- product where relevant; and
- enquiry message.

The home form becomes an explicit dealer/fitment-centre partner enquiry. It
requires a business name and records a selected type: dealer or fitment centre.
Its current misleading surname/canopy language is removed.

The lead model records trusted enquiry categories (`product_quote`,
`general_contact`, `dealer_enquiry`, `fitment_enquiry`) separately from
submission source and referral source. Public clients cannot forge trusted
source/type values. Historic leads are retained. New fields are persisted and
also included in internal email content.

The AU quote client/server request-type mismatch is corrected through a shared,
validated product quote contract so successful quotes persist and send normally.

### Admin enquiries

Adopt Navrik's manual-lead creation workflow. Staff can enter phone, walk-in,
or emailed leads with the same structured data. Customer-submitted lead details
remain an audit record; staff retain the existing status and notes controls.

The enquiries dashboard supports filtering and clear display of enquiry type,
status, location, referral source, product and date. Dealer and fitment
opportunities remain in the same queue, but are independently identifiable.

## Upload and display defects

The existing server upload policy remains JPEG, PNG and WebP at its current
size limit. The admin picker, client validation, guidance and error display
will match that policy, replacing the incorrect GIF/SVG promise and generic
failure state. No relaxation of the server's content restrictions is planned.

Restore the known missing icon registry entries (`login`, `event`, and
`notifications`) and conduct a browser-based visual audit for remaining
question-mark or broken-icon presentation defects. Correct only actual defects
found during that audit.

## Data migration and compatibility

Create a new forward-only migration after the currently applied AU migrations.
It creates/seeds managed categories, protects product/category linking, adds
the structured lead data and necessary valid lead values, and rebuilds affected
read models. Never edit `0001` or `0002`; both are part of the deployed
migration ledger.

All database access remains parameterised through the Netlify Database driver.
No secret, URL, recipient address, or environment value is added to browser
code or migrations.

## Verification and release

- Add tests first for category validation, product-category linking, public
  read models, quote acceptance, public enquiry fields, manual leads, upload
  errors, and missing-icon coverage.
- Run function tests, the production build, and focused browser acceptance
  checks for category admin, product creation, all public form types, manual
  lead creation, gallery upload validation and visible icons.
- Run the required security review and QA review gate for database, environment
  and HTTP endpoint changes. Resolve critical/high findings and failed tests
  before handoff.
- Commit implementation only after the user approves its written plan. Push,
  production migration, and deployment each require a separate current user
  confirmation.

## Completion criteria

- Only Canopies are initially published, but an administrator can manage a
  future category and add a product to it without code changes.
- Public pages no longer frame the site as permanently canopy-only.
- Quotes, general contact, dealer and fitment-centre submissions record and
  email the required Australian location and referral details.
- Admin supports manual lead entry and operational filtering.
- Upload messages match the secure formats actually accepted.
- The existing Meta Pixel configuration is unchanged.
