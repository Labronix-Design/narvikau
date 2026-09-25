# Navrik Business Control Centre Design

## Outcome

Replace the order-focused admin landing experience with an authenticated business-control centre. It must use genuine operational data, clearly identify gaps in measurement, and keep all provider credentials and refresh operations server-side.

## Boundaries

- Angular 21 standalone, lazy-loaded admin routes and Netlify Functions remain the platform.
- New financial records store amounts as integer cents. Existing transactional decimal-Rand data is read-only in this delivery and is labelled as legacy source data.
- Search Console and Netlify usage are cached server-side. Browser requests can read cached summaries only; only an authenticated admin can trigger a refresh.
- No currency conversion is performed without a configured frozen ZAR exchange-rate record. Supplier currency remains separate from invoice-ready ZAR amounts.
- Reports are persisted internal snapshots. Scheduled jobs do not send email.

## Architecture

1. Ordered migration creates a single business profile, integration settings, cache metadata, hosting rules, hosting observations and report snapshots.
2. `admin-control-centre` serves a composite cached business overview and accepts an authenticated refresh action. It invalidates only cache sections affected by a changed admin resource.
3. `admin-search-console` owns an OAuth setup state and cached read boundary. It returns setup guidance until an OAuth refresh token and property are configured; it never invents metrics.
4. `admin-hosting` returns provider snapshots, allocation rules, measurement coverage, costs and invoice readiness. With no provider usage source it returns explicit unavailable states.
5. Angular uses reusable state, metric, trend and responsive-list primitives. The new information architecture is Overview, Search visibility, Hosting & costs, Reports, Business profile, then operational work.

## Security

All new endpoints require server-side admin authentication. OAuth client secret, state secret, refresh token and any Netlify service token are Functions/Runtime secrets and never bundled. Refresh endpoints accept no client-supplied pricing, site identity or provider access token. GSC OAuth uses PKCE and state validation. Cache reads never provide a bypass parameter.

## External Configuration

Create the Google Search Console domain property for the former source-site domain only through an authenticated Google account that owns that domain. Required Netlify secret keys are `GSC_OAUTH_CLIENT_ID`, `GSC_OAUTH_CLIENT_SECRET`, `GSC_OAUTH_REDIRECT_URI`, `GSC_OAUTH_STATE_SECRET`, and `GSC_SITE_URL`; keys are created only when real values are supplied. Existing exposed Netlify values must be rotated and recreated as secrets before release.
