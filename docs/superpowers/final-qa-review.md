# Final QA review — 24 August 2026

## Scope

Read-only review of the catalogue quote-only boundary, the business read-model
contracts used by the admin control centre and sales performance view, and the
public design/AEO build outputs.

## Result

No remaining **Critical** or **Important** defect was found in the reviewed
implementation.

During review I found an Important client/server mismatch: an explicitly
`online_checkout` item with a missing, zero, negative or fractional cent amount
was offered checkout in the browser but rejected by the server. The corrected
client resolver now fails closed to `quote_only` for all of those values. The
updated component test covers the boundary, and the checkout function continues
to reject quote-only or non-positive server-resolved selections before pricing
or payment work.

## Evidence

| Check | Result |
| --- | --- |
| Focused catalogue, checkout, cache, control-centre, sales-cache and invalidation tests | 40 passed, 0 failed |
| Full Netlify function suite (`npm run test:functions`) | 108 passed, 0 failed |
| Website TypeScript (`npx tsc --noEmit -p tsconfig.website.json`) | Passed |
| Production build (`npm run build`) | Passed; 689.35 kB initial raw / 181.67 kB estimated transfer |
| Sitemap/brand-schema test | 1 passed, 0 failed |
| Whitespace validation (`git diff --check`) | Passed |

The built public output contains the new `navrik-primary.jpg` as favicon,
Open Graph/Twitter image and LocalBusiness logo/image. `robots.txt` disallows
`/admin`; the generated sitemap is public-only. A source scan found no
hard-coded `R0`, legacy price-confirmation copy, or `expedition` wording in
public runtime files. Listed product/accessory prices are rendered only from a
positive integer-cent field; missing/zero values use a quote flow instead.

The control-centre and sales endpoints are covered as cached-only reads: a
stale/missing snapshot returns the server explanation and `not_measured`, and
the tests assert that the sales endpoint does not query `orders` on a GET. The
authenticated refresh tests assert independently persisted
`business_overview` and `sales_performance` snapshots and narrow invalidation.

## Verification limits

- `npm test` cannot run: `angular.json` has no `test` target (actual output:
  `Cannot determine project or target for command.`). The repository has
  Jasmine specs, but no configured Karma/Jasmine runner, so these Angular
  component specs were compiled by the TypeScript/build checks rather than
  executed.
- I could not complete live visual browser checks for populated catalogue cards:
  the shared browser profile was already in use, and the local development
  server ended before an isolated session could be launched. The production
  build, responsive CSS/static review, and source-level boundary checks passed;
  populated mobile/desktop visual behaviour still needs an available browser
  session against a local Netlify runtime before release.
- No production database migration, deploy, email or external integration was
  performed.

