# Data-driven Navrik Australia catalogue design

## Purpose

Navrik Australia currently sells four canopy products, but the catalogue must
support future product categories without database, API, admin, or quote-form
code changes. The live catalogue remains the four existing canopy records until
new products are deliberately added by an administrator.

## Constraints

- The canonical public identity remains `https://navrik.com.au` and
  `info@navrik.com.au`.
- Keep the existing production Netlify Database and its already-applied AU
  migration intact. Forward migrations only; never rewrite `0001`.
- Keep payments, carts, checkout, finance, orders, and payment webhooks absent.
- Keep contact, product enquiry, warranty, public catalogue, and admin product
  management working.
- Preserve the current seed as exactly Adventure, Overland, Sports, and
  Defender canopy products.
- No secret values in code, docs, migrations, or browser bundles.

## Catalogue data model

`catalog_products` becomes category-neutral. It keeps generic public fields:
`slug`, `name`, `category`, `description`, `image_url`, `gallery_urls`, active
state, and sort order. The existing canopy-specific columns remain available
for the seeded canopy products but are optional; a new `specifications` JSONB
object carries product-specific labelled values for future categories.

The new migration removes the exact-four-slug and canopy-only checks, replacing
them with non-empty, lowercase URL-safe slug and category validation. Existing
rows are retained and backfilled with their canopy specification values. The
public catalogue continues to publish only active records.

## API and cache contract

The catalogue cache and storefront endpoints accept any active database product
that matches the generic public allowlist. They no longer filter an exact slug
set or overwrite category values. Cache payloads include the generic
`specifications` object but no payment, price, inventory, or private fields.

The admin product endpoint permits a validated category, editable slug, and
generic specifications. It rejects unknown top-level fields, malformed JSON,
payment fields, and private mutation fields. Existing canopy-specific fields
remain optional compatibility inputs during the transition and are mirrored
into specifications for public display.

## Product enquiries

The quote modal submits the selected product identity and a generic product
enquiry. The server derives the canonical enquiry type and stores
`product_quote`; clients cannot choose a trusted type or source. The migration
permits both existing `canopy_quote` leads and new `product_quote` leads so no
historical data is lost. New email copy is product-neutral while retaining the
selected product name.

## User interface

Shared navigation, catalogue, product detail, metadata, and warranty wording
use “Products”, “Catalogue”, “Product details”, and “Product quote”. The
current category section is labelled “Canopies” from its data, not from a
global hard-code. Product detail renders labelled specification entries from
`specifications`; current canopy descriptions and imagery remain unchanged.

Admin product management changes from the fixed four-item selector to editable
generic fields and category/specification management. No address is embedded
in public UI solely for internal reporting.

## Verification

Tests must demonstrate a non-canopy fixture can flow through admin validation,
cache rebuild, storefront response, product detail model, and product enquiry
validation, while the current seed still contains exactly four canopy products.
Tests must also ensure price/payment/order fields remain rejected and generic
enquiries cannot forge their source/type. Run full function tests and the
production build. Existing Angular unit-test infrastructure has no test target;
capture that limitation if it remains, and add browser acceptance where the
Netlify-backed local environment permits it.

## Production release

The refactor is local until reviewed. Its forward migration must be dry-run and
applied through the linked AU Netlify site, then the catalogue cache must be
re-built/purged and the live storefront verified. A separate explicit approval
is required before that production migration or deployment.
