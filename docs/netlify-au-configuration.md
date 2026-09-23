# Navrik Australia Netlify configuration

This checklist describes the separate Australian site. It does not configure
Netlify, DNS, the database, or email by itself. Keep every credential in the AU
Netlify site's environment settings; never commit values to this repository and
never copy values from another Navrik deployment.

## Required environment variable names

Configure these names in the AU Netlify site before enabling the corresponding
features. Values are intentionally omitted.

| Variable | Purpose |
| --- | --- |
| `NETLIFY_DATABASE_URL` | Dedicated AU Netlify Database connection |
| `EMAIL_API_KEY` | Dedicated AU Resend credential for transactional mail |
| `ADMIN_PASSWORD` | AU administration login secret |
| `ADMIN_APP_ORIGIN` | Optional exact browser-origin override; the intended AU value is `https://navrik.com.au`, which is also the same-origin code default |
| `MONTHLY_REPORT_RECIPIENTS` | Exact allowlist: `accounts@labronix.co.za,info@navrik.com.au` |
| `REPORTING_TIME_ZONE` | IANA time zone used for scheduled operations reports |
| `SITE_ID` | AU Netlify site identifier used for cache invalidation |
| `NETLIFY_PURGE_API_TOKEN` | AU site cache-purge credential |

Optional measurement integrations use `GA4_MEASUREMENT_ID`, `GA4_PROPERTY_ID`,
`GSC_OAUTH_CLIENT_ID`, `GSC_OAUTH_CLIENT_SECRET`, `GSC_OAUTH_REDIRECT_URI`,
`GSC_OAUTH_STATE_SECRET`, `GSC_TOKEN_ENCRYPTION_KEY`, and `GSC_SITE_URL`.
Configure them only for the AU properties. Register
`https://navrik.com.au/api/admin-search-console?action=callback` as the exact
OAuth callback and `sc-domain:navrik.com.au` as the exact Search Console domain
property. The public contact and quote mailbox uses the AU domain identity in
server code; the Resend sending domain must be verified in the separate AU
Resend account.

## Database preparation

1. Create or connect a Netlify Database for the AU site.
2. Add `NETLIFY_DATABASE_URL` to that site only.
3. Apply `netlify/database/migrations/0001_create-navrik-au-schema.sql` to the
   empty AU database.
4. Run `node netlify/assets/seed.mjs` with the AU database environment loaded.
5. Confirm the catalogue contains exactly Adventure, Overland, Sports, and
   Defender before making the site public.

The migration is a fresh AU schema. Do not apply migration history or seed data
from another deployment.

## Domain and DNS preparation

1. Add `navrik.com.au` as the custom domain on the AU Netlify site.
2. Set the apex domain as the primary canonical domain and configure `www` to
   redirect to it.
3. Copy Netlify's current DNS target records into the domain provider exactly as
   Netlify presents them; do not guess record targets.
4. Wait for Netlify to verify DNS and issue TLS before launch.
5. Confirm the deployed canonical tag, Open Graph URL, sitemap, robots file, and
   Search Console property all resolve to the apex AU domain.

Netlify schedules run at minutes 0, 15, 30, and 45 of every hour because the
report functions enforce 06:00 in `REPORTING_TIME_ZONE` themselves. Quarter-hour
triggers cover Australian whole-hour, half-hour, and 45-minute zones while
keeping local scheduling correct across daylight-saving changes.

## Pre-launch checks

- Run `npm run test:functions` and `npm run build`.
- Verify the home page and products page show only the four canopy models.
- Submit contact, quote, and warranty requests against a non-production test
  configuration before enabling real mail delivery.
- Confirm legacy `/accessories` and `/finance` links redirect to `/products`.
- Confirm no customer payment capability or payment credential is configured.
- Review all Australian business, legal, contact, and recipient details with the
  business owner before launch.

Deployment, DNS updates, live environment changes, and real email delivery need
separate approval.
