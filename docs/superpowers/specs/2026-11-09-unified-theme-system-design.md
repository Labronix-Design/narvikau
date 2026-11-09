# Unified Theme System Design

## Intent

Give Navrik administrators one reliable Site Settings theme that controls both
the customer-facing site and the entire admin experience. The saved theme must
always take precedence over a visitor's operating-system light/dark preference.

## Goals

- Remove all system light/dark appearance overrides from admin pages.
- Apply the same saved semantic colour palette to public pages, admin login,
  the admin shell, controls, tables, dialogs, loaders, and empty states.
- Expand Site Settings from four loosely related values into a structured,
  understandable palette with live preview and reset.
- Make the palette durable in Netlify Database and available through every
  public/admin settings read path.
- Keep existing saved brand, background, text, and accent colours working.
- Reject invalid, unknown, or unreadable palettes before saving.

## Non-goals

- No per-page, per-user, or automatic device-theme switching.
- No free-form CSS editor or arbitrary font URLs.
- No change to existing customer content, products, enquiries, or payments.

## Approaches Considered

1. Add more standalone colour columns. This is straightforward initially but
   becomes hard to evolve and forces a migration for every future token.
2. Expose every CSS token. This offers maximum freedom but makes it too easy to
   produce inaccessible or incoherent screens.
3. **Selected: structured semantic theme.** Persist one versioned `theme`
   object with a small, named palette; derive remaining shades consistently.
   This gives administrators meaningful control while retaining accessibility
   guardrails and a stable implementation surface.

## Theme Controls

The Branding section will present a compact Theme section with:

- Accent colour
- Page background
- Panel/surface colour
- Primary text colour
- Muted text colour
- Border colour
- Accent text colour
- Interface style: square, subtle, or rounded corners
- Layout density: compact, standard, or spacious

Status colours and focus styling remain safe derived values for this release;
they will use the palette rather than browser/OS defaults.

## Data and API Design

`site_settings.theme` is a versioned JSONB object, canonical after migration:

```json
{
  "version": 1,
  "surface": "#0a0908",
  "surface_raised": "#171513",
  "text": "#f2ede7",
  "text_muted": "#c4bdb4",
  "border": "#514c46",
  "accent": "#ea580c",
  "accent_text": "#ffffff",
  "focus": "#c1bbb3",
  "radius": "subtle",
  "density": "standard"
}
```

The migration backfills it from legacy `primary_color`, `background_color`,
and `font_color`. Legacy fields remain in responses during the transition, so
existing readers continue to work. Both `catalog-storefront` and
`site-settings` must return the canonical `theme` data.

The admin write endpoint accepts an exact allowlist of theme keys. Every colour
must be a six-digit hex value. The server rejects unknown keys, invalid enum
values, and palettes that fail minimum body-text or accent-text contrast.

## Client Architecture

`SiteSettingsService` is the only runtime theme applicator. It writes semantic
`--nv-*` and `--admin-*` custom properties to `:root`, never to a lazy-loaded
component host. Admin login and shell inherit these root tokens automatically.

The existing `prefers-color-scheme` override is removed. Hard-coded surface,
text, border, and interactive-state values are replaced with semantic tokens
throughout shared and individual admin styles. Customer UI uses the same root
palette; admin-specific tokens map to the same source values and derived
surfaces.

The Site Settings preview uses the exact save payload and the same service
application path. Reset restores the last saved theme. Save commits the
canonical response so no reload is required.

## Acceptance Criteria

- With any chosen valid saved palette, a browser's light/dark mode never
  changes the admin colours.
- The saved palette visibly applies to admin login, shell, navigation, pages,
  tables, form controls, modals, empty/loading/error states, and public pages.
- Site Settings preview and persisted save render identically.
- Invalid, unknown, or inaccessible theme input is rejected safely.
- Existing settings migrate without changing their intended brand colours.
