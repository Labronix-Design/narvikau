-- 0016: Public-content settings are migration-owned, never request-created.
-- It creates the missing public-content tables and singleton rows without
-- seeding coupon business data.

CREATE TABLE IF NOT EXISTS site_settings (
  id            SMALLINT PRIMARY KEY DEFAULT 1,
  logo_url      TEXT,
  font_family   TEXT NOT NULL DEFAULT 'Inter',
  primary_color TEXT NOT NULL DEFAULT '#ea580c',
  hero_slides   JSONB NOT NULL DEFAULT '[]',
  brand_logos   JSONB NOT NULL DEFAULT '[]',
  contact       JSONB NOT NULL DEFAULT '{}',
  trust_bar     JSONB NOT NULL DEFAULT '[]',
  compat_note   TEXT NOT NULL DEFAULT '',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT site_settings_singleton CHECK (id = 1)
);

ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS contact JSONB NOT NULL DEFAULT '{}';
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS trust_bar JSONB NOT NULL DEFAULT '[]';
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS compat_note TEXT NOT NULL DEFAULT '';

INSERT INTO site_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS legal_pages_settings (
  page       TEXT PRIMARY KEY,
  content    JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_page_settings (
  id         SMALLINT PRIMARY KEY DEFAULT 1,
  content    JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT finance_page_settings_singleton CHECK (id = 1)
);

INSERT INTO finance_page_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Supports active coupon lookups while retaining the existing soft-delete model.
ALTER TABLE promo_coupons DROP CONSTRAINT IF EXISTS promo_coupons_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS promo_coupons_code_active_idx
  ON promo_coupons (code)
  WHERE deleted_at IS NULL;
