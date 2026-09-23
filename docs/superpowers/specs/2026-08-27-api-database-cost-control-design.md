# Navrik API and Database Cost-Control Design

## Goal

Make database schema changes migration-only, prevent public traffic from causing database writes, and serve public content through durable, mutation-invalidated read models.

## Current failure

Public configuration and legal-content functions call runtime schema helpers that issue `CREATE TABLE`, `ALTER TABLE`, and seed inserts during ordinary GET requests. This makes anonymous page loads write-capable and masks database failures with default data. The live catalogue endpoints are failing, while site settings returns fallback defaults instead of the configured profile.

## Chosen approach

Use explicit Netlify Database migrations as the only schema authority. Public endpoints perform a single read against an already-built read model and return a long-lived durable CDN response. Authenticated mutations update the precise read model and purge only the matching CDN cache tag. Checkout and payment confirmation keep their existing narrow transactional writes and invalidate only order-derived business snapshots.

## Data boundaries

| Surface | Reads/writes | Cache | Authority |
|---|---|---|---|
| Public catalogue, site settings, legal content, inactive promo state | Read-only | Durable CDN, one-week fresh / one-month stale | Read models updated by authenticated admin writes |
| Public active promo availability | Read-only | Short durable cache, purged on checkout/promo mutation | Transactional promo state |
| Admin management | Authenticated reads/writes | No public cache | Database source tables |
| Checkout, webhook, warranty registration | Validated transactional writes | No public cache | Database source tables |

## Schema and migration rules

- No function may contain runtime DDL (`CREATE`, `ALTER`, `DROP`) or seed writes intended to create schema.
- Existing migration files remain immutable once applied. New migration files add missing singleton/read-model tables and initial seed rows with idempotent SQL.
- The migration directory must be restored before the next schema deployment; moving migrations to `_migrations` is only a temporary deployment bypass and must not be used as the permanent schema workflow.
- Missing required read models are operational failures, not a reason for public endpoints to fabricate default settings.

## Public cache contract

- `catalogue:*`, `site-settings`, and `legal-pages:*` responses use Netlify durable cache tags with one-week fresh TTL and one-month stale-while-revalidate window.
- Promo responses use a short durable TTL only while an offer can change because of a checkout; admin promo writes and successful payment state changes purge the promo tag.
- Public responses never accept a cache-bypass parameter or client-controlled variant.
- Admin/server mutations purge precise cache tags after their database transaction succeeds. No wildcard/cache-site purge is used.

## Failure behaviour

- Public endpoints return a non-cacheable 503 setup/unavailable payload when no valid cached data exists.
- They do not return HTTP 200 with invented defaults for a database outage.
- The Angular public shell shows a compact, customer-friendly unavailable state for a failed catalogue/configuration response instead of silently rendering fake/default merchandising.

## Verification

- Tests prohibit DDL in deployed functions and verify public GET handlers have no writes.
- Tests cover cache tags and exact invalidation mapping for each admin mutation and order event.
- Function tests, TypeScript checks, production build, and Netlify Dev visual checks at 375px, 768px, and 1440px are required.
- Security review covers environment variables, purge credentials, auth, and public endpoint behavior. QA verifies tests first and reruns after fixes.
