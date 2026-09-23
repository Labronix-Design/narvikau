-- 0003: Business-control-centre read models and provider boundaries.
-- New money fields below are integer minor units. Supplier-currency costs are
-- deliberately separate from invoice-ready ZAR cents; no FX conversion occurs
-- unless a frozen exchange rate is recorded by a future approved importer.

CREATE TABLE IF NOT EXISTS business_profiles (
  id          SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  content     JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO business_profiles (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS control_centre_cache (
  section        TEXT PRIMARY KEY CHECK (section IN ('business', 'search', 'hosting')),
  payload        JSONB NOT NULL,
  source         TEXT NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invalidated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_control_centre_cache_invalidated
  ON control_centre_cache (invalidated_at)
  WHERE invalidated_at IS NOT NULL;

-- Provider setup contains no OAuth credentials, access tokens, or client
-- secrets. Those are Netlify Functions runtime secrets only.
CREATE TABLE IF NOT EXISTS provider_settings (
  provider    TEXT PRIMARY KEY CHECK (provider IN ('google_search_console', 'netlify')),
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hosting_rules (
  id                    BIGSERIAL PRIMARY KEY,
  site_key              TEXT NOT NULL,
  base_hosting_cents    INTEGER,
  email_addon_cents     INTEGER,
  currency              CHAR(3) NOT NULL DEFAULT 'ZAR',
  usage_allocation      JSONB NOT NULL DEFAULT '{}'::jsonb,
  active_from           DATE NOT NULL,
  active_to             DATE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (base_hosting_cents IS NULL OR base_hosting_cents >= 0),
  CHECK (email_addon_cents IS NULL OR email_addon_cents >= 0),
  CHECK (active_to IS NULL OR active_to >= active_from)
);

CREATE INDEX IF NOT EXISTS idx_hosting_rules_site_active
  ON hosting_rules (site_key, active_from DESC)
  WHERE active_to IS NULL;

-- Imported provider observations only. `supplier_amount_minor` is in the
-- original supplier currency and must never be presented as a ZAR invoice
-- amount. `invoice_amount_cents` may only be populated by an approved frozen
-- exchange-rate process.
CREATE TABLE IF NOT EXISTS hosting_observations (
  id                    BIGSERIAL PRIMARY KEY,
  provider              TEXT NOT NULL DEFAULT 'netlify',
  period_start          DATE NOT NULL,
  period_end            DATE NOT NULL,
  site_key              TEXT,
  metric                TEXT NOT NULL,
  quantity              NUMERIC,
  supplier_currency     CHAR(3) NOT NULL,
  supplier_amount_minor BIGINT,
  invoice_amount_cents  INTEGER,
  measurement           JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_updated_at     TIMESTAMPTZ,
  CHECK (period_end >= period_start),
  CHECK (supplier_amount_minor IS NULL OR supplier_amount_minor >= 0),
  CHECK (invoice_amount_cents IS NULL OR invoice_amount_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_hosting_observations_provider_period
  ON hosting_observations (provider, period_end DESC, site_key);

CREATE TABLE IF NOT EXISTS internal_report_snapshots (
  id                    BIGSERIAL PRIMARY KEY,
  report_type           TEXT NOT NULL CHECK (report_type IN ('scheduled_business_control')),
  scheduled_for         TIMESTAMPTZ NOT NULL,
  payload               JSONB NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (report_type, scheduled_for)
);

CREATE INDEX IF NOT EXISTS idx_internal_report_snapshots_latest
  ON internal_report_snapshots (created_at DESC);
