# Business Control Centre configuration

Set these as Netlify **Functions/Runtime** secrets in the site environment UI.
Do not put values in `netlify.toml`, Angular environment files, source control, or
browser requests.

| Variable | Purpose |
| --- | --- |
| `NETLIFY_DATABASE_URL` | Existing Netlify Database connection for cached read models and report snapshots. |
| `EMAIL_API_KEY` | Existing Resend API key for transactional/internal email delivery. |
| `MONTHLY_REPORT_RECIPIENTS` | Comma-separated internal monthly-report allowlist. It must contain exactly `accounts@labronix.co.za,info@navrik.co.za` (order and case do not matter); missing, duplicate, or unknown values fail closed. |
| `ADMIN_APP_ORIGIN` | Optional exact cross-origin allowlist. Same-origin admin requests need no CORS exception. |
| `GSC_OAUTH_CLIENT_ID` | Google OAuth client identifier. |
| `GSC_OAUTH_CLIENT_SECRET` | Google OAuth client secret. |
| `GSC_OAUTH_REDIRECT_URI` | Registered HTTPS OAuth callback URI for controlled onboarding. |
| `GSC_OAUTH_STATE_SECRET` | Secret reserved for signed OAuth state validation during controlled onboarding. |
| `GSC_TOKEN_ENCRYPTION_KEY` | Base64-encoded 32-byte AES-256-GCM key for encrypted PKCE verifiers and refresh tokens. |
| `GSC_SITE_URL` | Search Console property, expected to be `sc-domain:navrik.co.za` once ownership is verified. |

Creating `sc-domain:navrik.co.za`, authorising Google, and setting these secrets
are external account actions. They are intentionally not performed by an HTTP
request or a browser client. Register the exact callback
`https://www.navrik.co.za/api/admin-search-console?action=callback` in Google
Cloud, then an authenticated admin may open `GET /api/admin-search-console?action=connect`.
Google returns to that callback; its signed, single-use, 10-minute PKCE state is
validated server-side before a code exchange. The encrypted refresh token is
stored only in Netlify Database, never in an environment variable or response.
Until the secrets and property access exist, the Search Console endpoint returns
`setup_required`; it never returns invented metrics.

## Monthly internal business report

`monthly-business-report-scheduled` runs at 06:00 SAST on the first day of each
month and sends the preceding completed calendar-month report separately to the two
approved internal addresses in `MONTHLY_REPORT_RECIPIENTS`: `accounts@labronix.co.za`
and `info@navrik.co.za`. The job uses independent durable delivery records and provider
idempotency keys, so a period/recipient/report-type
combination is sent once even when Netlify retries it. It records failure state
without sending a client invoice or any other external mail.

An authenticated admin can review the current SAST month-to-date report with
`GET /api/monthly-business-report`, then explicitly issue
`POST /api/monthly-business-report` with `{ "action": "send_current" }` to send
the initial internal report. The recipient is read only from the server-side
environment; it is never accepted from a browser request.

Monthly reporting uses an exact server-side Search Console calendar-period
snapshot, cached by its start and end date. It never accepts a reporting period,
OAuth credential, or refresh instruction from a browser. If the provider is not
configured or no authorised Google grant exists, the report preserves that setup
or “Not measured yet” explanation instead of substituting rolling 30-day data.
Hosting costs retain their supplier currency and stay out of invoice-ready Rand
totals unless an approved, frozen exchange-rate process has populated such an
amount.
