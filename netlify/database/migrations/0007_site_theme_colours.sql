-- Configurable storefront shell colours. Defaults retain the original Navrik AU theme.
ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS background_color TEXT NOT NULL DEFAULT '#0a0908',
  ADD COLUMN IF NOT EXISTS font_color TEXT NOT NULL DEFAULT '#f2ede7';
