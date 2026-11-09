-- Rollback (after deploying readers that no longer require theme):
-- BEGIN;
-- ALTER TABLE site_settings DROP CONSTRAINT IF EXISTS site_settings_theme_check;
-- ALTER TABLE site_settings DROP COLUMN IF EXISTS theme;
-- COMMIT;
-- Legacy colours are retained and synchronised by the write endpoint, so rollback
-- preserves the latest brand/background/text settings. No index is needed: the
-- settings singleton continues to be read and updated through its primary key.

BEGIN;
ALTER TABLE site_settings ADD COLUMN theme JSONB;

-- Transaction-local helpers keep SQL backfill and runtime fallback derivation
-- identical without adding permanent functions to the application schema.
CREATE FUNCTION pg_temp.theme_mix(surface TEXT, foreground TEXT, weight NUMERIC)
RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT '#' || string_agg(lpad(to_hex(round(
    get_byte(decode(substr(surface, 2), 'hex'), channel) * (1 - weight)
    + get_byte(decode(substr(foreground, 2), 'hex'), channel) * weight
  )::integer), 2, '0'), '' ORDER BY channel)
  FROM generate_series(0, 2) AS channel;
$$;

CREATE FUNCTION pg_temp.theme_luminance(colour TEXT)
RETURNS DOUBLE PRECISION LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT sum((CASE WHEN value <= 0.04045 THEN value / 12.92
    ELSE power((value + 0.055) / 1.055, 2.4) END) * weight)
  FROM (SELECT get_byte(decode(substr(colour, 2), 'hex'), channel) / 255.0 AS value,
    (ARRAY[0.2126, 0.7152, 0.0722])[channel + 1] AS weight
    FROM generate_series(0, 2) AS channel) AS channels;
$$;

CREATE FUNCTION pg_temp.theme_contrast(first_colour TEXT, second_colour TEXT)
RETURNS DOUBLE PRECISION LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT (greatest(a, b) + 0.05) / (least(a, b) + 0.05)
  FROM (SELECT pg_temp.theme_luminance(first_colour) AS a,
    pg_temp.theme_luminance(second_colour) AS b) AS luminances;
$$;

WITH legacy AS (
  SELECT id,
    CASE WHEN background_color ~ '^#[0-9a-fA-F]{6}$' THEN lower(background_color) ELSE '#0a0908' END AS surface,
    CASE WHEN font_color ~ '^#[0-9a-fA-F]{6}$' THEN lower(font_color) ELSE '#f2ede7' END AS foreground,
    CASE WHEN primary_color ~ '^#[0-9a-fA-F]{6}$' THEN lower(primary_color) ELSE '#ea580c' END AS accent
  FROM site_settings
)
UPDATE site_settings AS settings
SET theme = jsonb_build_object(
  'version', 1,
  'surface', legacy.surface,
  'surface_raised', CASE WHEN legacy.surface = '#0a0908' AND legacy.foreground = '#f2ede7' THEN '#171513' ELSE pg_temp.theme_mix(legacy.surface, legacy.foreground, 0.06) END,
  'text', legacy.foreground,
  'text_muted', CASE WHEN legacy.surface = '#0a0908' AND legacy.foreground = '#f2ede7' THEN '#c4bdb4' ELSE pg_temp.theme_mix(legacy.surface, legacy.foreground, 0.8) END,
  'border', CASE WHEN legacy.surface = '#0a0908' AND legacy.foreground = '#f2ede7' THEN '#514c46' ELSE pg_temp.theme_mix(legacy.surface, legacy.foreground, 0.3) END,
  'accent', legacy.accent,
  'accent_text', CASE WHEN pg_temp.theme_contrast(legacy.accent, '#ffffff') > pg_temp.theme_contrast(legacy.accent, '#0a0908') THEN '#ffffff' ELSE '#0a0908' END,
  'focus', CASE WHEN legacy.surface = '#0a0908' AND legacy.foreground = '#f2ede7' THEN '#c1bbb3' ELSE pg_temp.theme_mix(legacy.surface, legacy.foreground, 0.75) END,
  'radius', 'subtle',
  'density', 'standard'
)
FROM legacy WHERE settings.id = legacy.id;

ALTER TABLE site_settings ALTER COLUMN theme SET NOT NULL;
ALTER TABLE site_settings ALTER COLUMN theme SET DEFAULT '{"version":1,"surface":"#0a0908","surface_raised":"#171513","text":"#f2ede7","text_muted":"#c4bdb4","border":"#514c46","accent":"#ea580c","accent_text":"#0a0908","focus":"#c1bbb3","radius":"subtle","density":"standard"}'::jsonb;

-- Schema guards shape and values. Contrast is enforced on API writes; a backfill
-- deliberately preserves existing brand colours even if an old palette needs
-- administrator correction before its next save.
ALTER TABLE site_settings ADD CONSTRAINT site_settings_theme_check CHECK (
  COALESCE(CASE WHEN jsonb_typeof(theme) = 'object' THEN
    theme ?& ARRAY['version', 'surface', 'surface_raised', 'text', 'text_muted', 'border', 'accent', 'accent_text', 'focus', 'radius', 'density']
    AND theme - ARRAY['version', 'surface', 'surface_raised', 'text', 'text_muted', 'border', 'accent', 'accent_text', 'focus', 'radius', 'density'] = '{}'::jsonb
    AND theme->'version' = '1'::jsonb
    AND theme->>'radius' IN ('square', 'subtle', 'rounded')
    AND theme->>'density' IN ('compact', 'standard', 'spacious')
    AND theme->>'surface' ~ '^#[0-9a-fA-F]{6}$'
    AND theme->>'surface_raised' ~ '^#[0-9a-fA-F]{6}$'
    AND theme->>'text' ~ '^#[0-9a-fA-F]{6}$'
    AND theme->>'text_muted' ~ '^#[0-9a-fA-F]{6}$'
    AND theme->>'border' ~ '^#[0-9a-fA-F]{6}$'
    AND theme->>'accent' ~ '^#[0-9a-fA-F]{6}$'
    AND theme->>'accent_text' ~ '^#[0-9a-fA-F]{6}$'
    AND theme->>'focus' ~ '^#[0-9a-fA-F]{6}$'
  ELSE FALSE END, FALSE)
);
DROP FUNCTION pg_temp.theme_contrast(TEXT, TEXT);
DROP FUNCTION pg_temp.theme_luminance(TEXT);
DROP FUNCTION pg_temp.theme_mix(TEXT, TEXT, NUMERIC);
COMMIT;
