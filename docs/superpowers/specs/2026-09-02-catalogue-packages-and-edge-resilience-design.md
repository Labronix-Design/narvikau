# Catalogue Packages and Edge Resilience Design

## Goal

Keep the product catalogue available when a Function runtime lacks its database configuration, and let an administrator publish any-sized, fixed-price or quote-only product packages without hard-coded catalogue data.

## Decisions

- Customers see **Packages**, not the internal word “combo”.
- A package may contain any number of existing products and accessories.
- A package with a positive configured price is purchasable; a zero/absent price is quote-only. This rule is calculated server-side and browser amounts are never trusted.
- A published package is visible only if it and every included source item are active.
- Products and accessories referenced by a package cannot be deleted. The administrator must first edit or remove the package.
- Public catalogue reads use the existing durable, tagged, server-built read model. Browser requests never rebuild or purge it. An authenticated admin mutation rebuilds and purges only affected sections.

## Data model

Migration `0017_catalogue_packages.sql` adds `catalog_packages` and ordered `catalog_package_items`. Each item references exactly one product or one accessory, with a positive quantity. Package money is persisted as `price_cents` integer cents. Foreign keys use `ON DELETE RESTRICT`.

The existing `catalogue_read_models` check constraint gains `packages`. The public package snapshot contains package presentation data and a server-resolved ordered member list, but never uses a member price to calculate the package amount.

## Endpoint and cache design

- `catalog-products` validates the database URL and creates its SQL client inside the handler error boundary. A missing or unusable database configuration returns an uncached `503`, never an unhandled runtime error.
- `catalog-packages` is read-only and returns the packages read model with `catalogue:packages` durable cache tags.
- `admin-packages` requires the existing admin token on every method. It validates request shape, distinct active source IDs, and ZAR input before converting to cents. It rebuilds `packages` then purges `catalogue:packages` after a successful mutation.
- Product/accessory changes rebuild and purge their own section plus packages, because they can affect package visibility/content.
- Checkout accepts only `package:<slug>` selections. It resolves package, members and current availability from the database, rejects quote-only/inactive/tampered selections, and charges only the stored package `price_cents`.

## UI design

Public `/packages` and `/packages/:slug` follow Navrik’s existing dark, token-driven visual system. Cards use real package imagery, a concise “Includes” list, and one unmistakable primary action: **Add to cart** for priced packages or **Request a quote** otherwise. The layout reserves image space, uses visible focus states, semantic controls, reduced-motion support, and reflows at 375, 768, 1024 and 1440px.

`/admin/packages` is a protected editing surface. It provides an ordered, repeatable member list—not a limited set of fixed fields—plus package details, price, state, imagery and clear inline validation. It reuses established admin controls and does not expose supplier data or secrets.

## Verification and security

Tests precede every behaviour change. Function/schema/endpoint/auth changes receive a security review and QA review. Verification includes focused Node function tests, relevant Angular tests, production build, Netlify Dev smoke checks, and responsive visual checks. No deployment, push, email, or production-configuration change is part of this work.
