# Business Control Centre configuration

The Navrik Australia control centre reads only server-side Netlify environment
variables and database records. Configuration values must not be placed in
`netlify.toml`, Angular environment files, source control, or browser requests.

The authoritative AU setup checklist and complete environment-variable list are
in [netlify-au-configuration.md](netlify-au-configuration.md). Values are
intentionally omitted from both documents.

## Search and website measurement

Google Search Console and Analytics are optional. When configured, use only the
AU domain property, callback, and analytics property. OAuth state is signed,
single-use, expires after ten minutes, and is validated server-side before the
code exchange. The encrypted refresh token remains in Netlify Database and is
never returned to the browser.

Until the AU credentials and property access exist, the endpoint reports a
setup-required state instead of inventing metrics.

## Monthly internal operations report

The scheduled function runs at minutes 0, 15, 30, and 45 of every hour and
sends only when it reaches 06:00 on the first day of the month in
`REPORTING_TIME_ZONE`. The preceding completed local calendar month is sent
separately to the exact server-side allowlist in `MONTHLY_REPORT_RECIPIENTS`:
the Labronix internal operations recipient `accounts@labronix.co.za` and the
Navrik AU recipient `info@navrik.com.au`.

Independent durable delivery records and provider idempotency keys keep a
period/recipient/report-type combination from being sent twice when Netlify
retries. Browser requests cannot choose the report period, credentials, or
recipient list.
