-- 0016: Migration-owned public-content tables and singleton rows.
--
-- Request handlers only read and write these records. This migration owns the
-- idempotent schema and singleton setup. Roll back only after deploying the
-- previous handlers; do not remove any content rows that were subsequently
-- edited in the admin UI.

CREATE TABLE IF NOT EXISTS site_settings (
  id            SMALLINT PRIMARY KEY DEFAULT 1,
  logo_url      TEXT,
  font_family   TEXT NOT NULL DEFAULT 'Inter',
  primary_color TEXT NOT NULL DEFAULT '#ea580c',
  hero_slides   JSONB NOT NULL DEFAULT '[]',
  brand_logos   JSONB NOT NULL DEFAULT '[]',
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
