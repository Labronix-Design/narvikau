# Navrik Australia Canopies-Only Clone Design

## Purpose

Create Navrik Australia at `navrik.com.au` as a functional clone of the existing
Navrik South Africa site. It will retain the established Angular, Netlify,
database-managed catalogue, administration, enquiry, warranty, analytics, and
public-content workflows while serving only the canopy product range and no
payment capability.

## Source and repository boundary

The existing repository at `/Users/hannolabuschagne/Documents/GitHub/navrik` is
the source of truth. Implementation begins by copying that repository's tracked
application files into `/Users/hannolabuschagne/Documents/GitHub/narvikau` and
then reducing and adapting that clone. It must not recreate the application from
scratch or alter the South African repository.

The AU repository is an independent deployment. It has its own Netlify site,
database, Resend account/key, email recipients, admin password, cache tokens,
and domain configuration. No South African secret, database connection, payment
credential, or deployment configuration is reused.

## Public catalogue and customer flows

The AU catalogue contains only these existing canopy models and their existing
canopy imagery:

- Navrik Canopy — Adventure
- Navrik Canopy — Overland
- Navrik Canopy — Sports
- Navrik Canopy — Defender

The home page and `/products` route retain their established presentation and
quote calls to action, but describe the Australian canopies-only range. Contact
and quote forms retain their current validation, rate limiting, database
persistence, and transactional email workflow.

The following public capabilities are removed, not hidden: cart, checkout,
checkout confirmation/cancellation views, payment calls, finance, coupons,
orders, trays, accessories, catalogue packages, and compatibility browsing.
`/accessories` and `/finance` should redirect to `/products` so older incoming
links are useful but cannot reveal an inactive offering.

Warranty registration, public content, legal pages, analytics consent, uploads,
and the public contact flow remain like-for-like. Payment/pricing language is
removed from retained public/legal content. Specific Australian address and
recipient values remain site configuration; public email copy follows the source
format with the AU domain (`info@navrik.com.au`) unless the business supplies a
different address before launch.

## Application and database architecture

The clone keeps the source Angular and Netlify architecture. The public
storefront continues to read a database-backed catalogue read model. Its AU
schema/seed path includes the product, site-settings, public-content, legal,
lead, warranty, cache, analytics, upload, and administration records needed by
the retained flows, but seeds only canopy products.

Both public and admin endpoints must make non-canopy data impossible to load:
unneeded tray, accessory, package, compatibility, purchase-mode, coupon, and
order tables/endpoints/services/components are removed from the AU app rather
than merely filtered in the UI. Admin product management remains for the canopy
catalogue only.

The checkout creation function, Yoco webhook, cart service/component, finance
page, finance administration, coupon administration, order administration,
payment-oriented reports, and their supporting models/tests/migrations are
removed. No payment environment variables are read or documented in the AU
project.

## Domain, email, and search configuration

All source references to `navrik.co.za`, `www.navrik.co.za`, South Africa,
`en-ZA`, ZAR/Rand, and SAST are assessed and changed or removed where they are
public or operationally relevant. The new canonical origin is
`https://navrik.com.au`; its `www` behaviour will be set consistently in the AU
Netlify domain configuration before launch.

This includes CNAME, Netlify allowed origins, canonical/OG metadata, sitemap,
robots sitemap URL, JSON-LD, browser metadata service, static index metadata,
and automated-test expectations. Structured data uses Australian locale/country
values and must not claim an unprovided street address or state.

The AU Netlify site will be configured independently with at least:

- `NETLIFY_DATABASE_URL`
- `EMAIL_API_KEY`
- `ADMIN_PASSWORD`
- `ADMIN_APP_ORIGIN=https://navrik.com.au`
- AU-specific email/report recipient settings used by retained functions
- cache-purge/site identifiers required by retained cache invalidation

These values are configured in the AU Netlify project only and are never
committed. The existing application convention of reading `EMAIL_API_KEY` in
server functions is retained.

## Error handling and safety

Existing safe loading, unavailable-content, form validation, rate limiting, and
email failure messages remain. The removal must leave no payment route or
credential that can be called accidentally. All retained database access stays
parameterised through the serverless Neon driver and all retained public
mutation endpoints keep their validation/rate limiting.

## Testing and acceptance criteria

The implementation must add or update tests demonstrating that:

1. the AU seeded/public catalogue returns only the four canopy models;
2. cart, checkout, finance, and payment webhook functionality is absent and
   legacy finance/accessory routes redirect to the canopy catalogue;
3. contact and quote submissions still validate, persist, and send through the
   existing AU-configurable server-side email pattern;
4. sitemap, robots, canonical metadata, and schema use `navrik.com.au` and
   Australian context with no South African origin; and
5. the Angular application, Netlify functions, and production build succeed.

Verification also includes a source scan for payment provider references,
South-African domain strings, and non-canopy catalogue assets/routes, followed
by a browser check of the canopies catalogue and both enquiry flows.

## Explicit non-goals

- Deploying to production, configuring the live custom domain, or sending any
  real email is not included without a separate confirmation.
- Introducing a new payment provider is out of scope.
- Creating Australian business/address/legal details not supplied by Navrik is
  out of scope; retained placeholders/settings must be updated before launch.
