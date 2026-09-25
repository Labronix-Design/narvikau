# Dynamic catalogue and internal report recipients

## Purpose

Make Navrik's public catalogue and checkout reflect the active administrator-managed catalogue at all times. No public page, checkout calculation, product name, product description, price, configured option, or Expedition canopy reference may depend on a fixed client or function constant.

Add the former source-site mailbox as a second separate, internal recipient for monthly business reports, alongside the existing Labronix reporting mailbox.

## Catalogue authority and cache

`catalog_products`, `product_variants`, `catalog_accessories`, and compatibility data are the source of truth. Catalogue money is stored as integer cents. Admin forms may display and accept ZAR amounts, but their functions convert to and from cents at the server boundary.

Server-owned catalogue read models supply products, accessories, compatibility, and category summaries. Public endpoints only read these models and offer no refresh or cache-bypass input. Responses are marked `no-store` for browsers so that cache control remains server-side.

Admin mutations authenticate first and invalidate/rebuild only the affected read model:

- Product and variant changes rebuild products and category summaries.
- Accessory changes rebuild accessories and category summaries.
- Compatibility changes rebuild compatibility only.
- Category changes rebuild category summaries only.

No public function may create schema or seed products at request time. Migrations own schema changes. Removed or inactive records never reappear because of a request.

## Public experience

The home showcase, navigation, catalogue, product detail, accessories and quote options consume the cached catalogue models. Product-specific cards use database fields only. Generic UI labels remain generic and sections hide when their underlying active data is absent.

The product-detail selectors and price breakdown derive from the active product variants. No fixed cab-size deltas, coating prices, colour choices, deposit percentages, model names, or product image paths remain. If a product is quote-only, its CTA remains quote-only without a fabricated price.

The checkout function resolves every selected product and accessory against active database records and derives all prices in cents server-side. It rejects absent, inactive, removed, or incompatible entries and never trusts browser item prices.

## Expedition removal

A migration removes the Expedition product record. The seed source, admin model whitelist, public copy, and obsolete Expedition asset are removed. Since all product references derive from the active catalogue, an administrator can add, rename, update or delete future products without code changes.

## Monthly report recipients

`MONTHLY_REPORT_RECIPIENTS` is parsed server-side as the exact allowlist of the existing Labronix internal reporting mailbox (`accounts@labronix.co.za`) and the Navrik AU mailbox (`info@navrik.com.au`). Missing, duplicate or unknown values fail closed. Preview responses never expose recipient addresses.

One report snapshot is built per period, then delivery is claimed and sent independently for each approved recipient. The existing delivery uniqueness key includes the recipient, so no schema change is needed for independent idempotency. A partial failure is reported safely and can be retried without duplicating a completed recipient's email.

## Safety and verification

All modified functions, migrations, environment-variable access, checkout routes and recipient delivery paths go through the security and QA review gate. Tests are written before implementation and cover targeted read-model invalidation, removed-product behaviour, server-side checkout calculation, recipient allowlisting, independent idempotency and partial delivery. Verification includes focused tests, full function tests, Angular compilation/build and desktop/mobile browser checks.
