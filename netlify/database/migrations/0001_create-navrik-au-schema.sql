-- Navrik Australia initial schema.
-- This migration targets a new Netlify Database and deliberately has no
-- dependency on the South African migration history.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Catalogue -----------------------------------------------------------------

CREATE TABLE catalog_products (
  id                  SERIAL PRIMARY KEY,
  slug                TEXT NOT NULL UNIQUE CHECK (slug IN (
                        'navrik-canopy-adventure',
                        'navrik-canopy-overland',
                        'navrik-canopy-sports',
                        'navrik-canopy-defender'
                      )),
  name                TEXT NOT NULL,
  category            TEXT NOT NULL DEFAULT 'canopy' CHECK (category = 'canopy'),
  size                TEXT,
  color               TEXT NOT NULL DEFAULT 'black',
  description         TEXT,
  image_url           TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  gallery_urls        TEXT[] NOT NULL DEFAULT '{}',
  material            TEXT,
  thickness           TEXT,
  front_door_window   TEXT,
  side_door           TEXT,
  rear_door           TEXT,
  vehicle_fit         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_catalog_products_updated_at
  BEFORE UPDATE ON catalog_products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_catalog_products_active_sort
  ON catalog_products (is_active, sort_order, name);

CREATE TABLE product_variants (
  id             SERIAL PRIMARY KEY,
  product_id     INTEGER NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
  variant_type   TEXT NOT NULL,
  variant_value  TEXT NOT NULL,
  label          TEXT NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, variant_type, variant_value)
);

CREATE INDEX idx_product_variants_active_product
  ON product_variants (product_id, is_active, variant_type, sort_order);

CREATE TABLE catalogue_read_models (
  section     TEXT PRIMARY KEY CHECK (section = 'products'),
  payload     JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(payload) = 'array'),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enquiries -----------------------------------------------------------------

CREATE TABLE customers (
  id             SERIAL PRIMARY KEY,
  first_name     TEXT NOT NULL,
  last_name      TEXT NOT NULL DEFAULT '',
  email          TEXT NOT NULL UNIQUE,
  phone          TEXT,
  vehicle_make   TEXT,
  vehicle_model  TEXT,
  vehicle_year   SMALLINT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE leads (
  id           SERIAL PRIMARY KEY,
  source       TEXT NOT NULL CHECK (source IN ('contact_form', 'canopy_quote')),
  name         TEXT,
  email        TEXT,
  phone        TEXT,
  company      TEXT,
  product      TEXT,
  message      TEXT,
  status       TEXT NOT NULL DEFAULT 'new'
                 CHECK (status IN ('new', 'contacted', 'quoted', 'converted', 'closed')),
  admin_notes  TEXT,
  customer_id  INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_leads_created_at ON leads (created_at DESC);
CREATE INDEX idx_leads_email ON leads (email);
CREATE INDEX idx_leads_source_status ON leads (source, status);

CREATE TABLE public_submission_rate_limits (
  rate_key           TEXT PRIMARY KEY,
  attempts           INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  window_started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_public_submission_rate_limits_cleanup
  ON public_submission_rate_limits (updated_at);

-- Warranty ------------------------------------------------------------------

CREATE TABLE warranty_registrations (
  id                       BIGSERIAL PRIMARY KEY,
  registration_reference   TEXT NOT NULL UNIQUE,
  purchaser_name           TEXT NOT NULL,
  purchaser_email          TEXT NOT NULL,
  purchaser_phone          TEXT NOT NULL,
  product_id               INTEGER REFERENCES catalog_products(id) ON DELETE SET NULL,
  product_name             TEXT NOT NULL,
  purchase_reference       TEXT,
  vehicle_make             TEXT NOT NULL,
  vehicle_model            TEXT NOT NULL,
  vehicle_year             SMALLINT NOT NULL CHECK (vehicle_year BETWEEN 1900 AND 2100),
  vehicle_registration     TEXT NOT NULL,
  purchase_date            DATE NOT NULL,
  fitment_date             DATE NOT NULL,
  consent_at               TIMESTAMPTZ NOT NULL,
  registered_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (fitment_date >= purchase_date)
);

CREATE INDEX idx_warranty_registrations_registered_at
  ON warranty_registrations (registered_at DESC, id DESC);
CREATE INDEX idx_warranty_registrations_email
  ON warranty_registrations (purchaser_email);

-- Admin authentication and audit -------------------------------------------

CREATE TABLE admin_sessions (
  id          SERIAL PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_sessions_expires_at ON admin_sessions (expires_at);

CREATE TABLE admin_login_attempts (
  attempt_key        TEXT PRIMARY KEY,
  failed_attempts    INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  window_started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  blocked_until      TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_login_attempts_updated_at ON admin_login_attempts (updated_at);

CREATE TABLE admin_audit_log (
  id          BIGSERIAL PRIMARY KEY,
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_audit_log_entity_created
  ON admin_audit_log (entity, created_at DESC);

-- Public content ------------------------------------------------------------

CREATE TABLE site_settings (
  id             SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  logo_url       TEXT,
  font_family    TEXT NOT NULL DEFAULT 'Inter',
  primary_color  TEXT NOT NULL DEFAULT '#ea580c',
  hero_slides    JSONB NOT NULL DEFAULT '[]'::jsonb,
  brand_logos    JSONB NOT NULL DEFAULT '[]'::jsonb,
  contact        JSONB NOT NULL DEFAULT '{}'::jsonb,
  trust_bar      JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO site_settings (id) VALUES (1);

CREATE TABLE legal_pages_settings (
  page        TEXT PRIMARY KEY CHECK (page IN ('refund', 'terms')),
  content     JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Non-revenue analytics and reporting --------------------------------------

CREATE TABLE business_profiles (
  id          SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  content     JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO business_profiles (id) VALUES (1);

CREATE TABLE control_centre_cache (
  section         TEXT PRIMARY KEY CHECK (
    section IN ('business', 'business_overview', 'enquiries', 'search', 'hosting', 'analytics')
  ),
  payload         JSONB NOT NULL,
  source          TEXT NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invalidated_at  TIMESTAMPTZ
);

CREATE INDEX idx_control_centre_cache_invalidated
  ON control_centre_cache (invalidated_at)
  WHERE invalidated_at IS NOT NULL;

CREATE TABLE provider_settings (
  provider    TEXT PRIMARY KEY CHECK (provider IN ('google_search_console', 'netlify')),
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE gsc_oauth_states (
  state_hash           TEXT PRIMARY KEY,
  verifier_ciphertext  TEXT NOT NULL,
  expires_at           TIMESTAMPTZ NOT NULL,
  consumed_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gsc_oauth_states_expiry ON gsc_oauth_states (expires_at);

CREATE TABLE gsc_oauth_grants (
  id                        SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  refresh_token_ciphertext  TEXT NOT NULL,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE hosting_observations (
  id                 BIGSERIAL PRIMARY KEY,
  provider           TEXT NOT NULL DEFAULT 'netlify',
  period_start       DATE NOT NULL,
  period_end         DATE NOT NULL,
  site_key           TEXT,
  metric             TEXT NOT NULL,
  quantity           NUMERIC,
  measurement        JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_updated_at  TIMESTAMPTZ,
  CHECK (period_end >= period_start)
);

CREATE INDEX idx_hosting_observations_provider_period
  ON hosting_observations (provider, period_end DESC, site_key);

CREATE TABLE internal_report_snapshots (
  id             BIGSERIAL PRIMARY KEY,
  report_type    TEXT NOT NULL CHECK (report_type IN ('scheduled_operations')),
  scheduled_for  TIMESTAMPTZ NOT NULL,
  payload        JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (report_type, scheduled_for)
);

CREATE INDEX idx_internal_report_snapshots_latest
  ON internal_report_snapshots (created_at DESC);

CREATE TABLE monthly_report_deliveries (
  id                   BIGSERIAL PRIMARY KEY,
  report_type          TEXT NOT NULL CHECK (report_type IN ('monthly_operations')),
  period_start         DATE NOT NULL,
  period_end           DATE NOT NULL,
  recipient            TEXT NOT NULL,
  send_state           TEXT NOT NULL DEFAULT 'sending'
                         CHECK (send_state IN ('sending', 'sent', 'failed')),
  payload              JSONB NOT NULL,
  provider_message_id  TEXT,
  attempt_started_at   TIMESTAMPTZ,
  sent_at              TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start),
  UNIQUE (report_type, period_start, period_end, recipient)
);

CREATE INDEX idx_monthly_report_deliveries_sent_at
  ON monthly_report_deliveries (sent_at DESC)
  WHERE send_state = 'sent';
CREATE INDEX idx_monthly_report_delivery_reclaim
  ON monthly_report_deliveries (attempt_started_at)
  WHERE send_state = 'sending';

CREATE TABLE search_console_monthly_snapshots (
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  payload       JSONB NOT NULL,
  source        TEXT NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (period_start, period_end),
  CHECK (period_end >= period_start)
);

CREATE INDEX idx_search_console_monthly_snapshots_updated
  ON search_console_monthly_snapshots (updated_at DESC);

-- Rollback for this fresh-database initial migration is to discard the AU
-- database branch/site database and recreate it before any production data is
-- accepted. No South African schema or data is migrated by this file.
