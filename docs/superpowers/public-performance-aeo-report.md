# Public performance, AEO and SEO report

## Measured baseline

The supplied live-home trace measured LCP at **2.707 s**, made up of **702 ms TTFB** and **1.069 s image load delay**, with **CLS 0.68**. No new post-change field or lab measurement is reported here; a fresh production bundle was built, but no browser trace was captured against it.

## Diagnosis

- The home hero is rendered by Angular after bootstrap and can be replaced by `/api/site-settings` data. A static document-level preload for the fallback image would therefore fetch the wrong image whenever an administrator has configured hero art.
- The hero container already reserves a fixed viewport region. The catalogue uses a 4:3 image wrapper and the vehicle-logo grid uses a fixed-height logo container, so those image areas reserve their layout without inventing dimensions for administrator-hosted images.
- Homepage metadata was competing: the routed page added generic tags after the root shell had already managed canonical/description metadata. The generic keywords tag also carried no useful search intent.
- The built HTML had two independently authored organization schemas: the source document schema and the post-build schema injection.

## Changes

- Centralised title, description, canonical, Open Graph and Twitter values for every public route in `WebsiteComponent`; product-detail copy remains generic and never supplies a product name, price or specification from client assumptions.
- Preserved admin behaviour: admin paths receive `noindex, nofollow, noarchive` and have their canonical link removed.
- Removed the homepage component’s competing generic SEO tags and weak keywords metadata.
- Switched public Google/schema/Open Graph/Twitter/favicon references to the audited primary brand asset: `/assets/brand-logo/navrik-primary.jpg`.
- Kept exactly one production JSON-LD graph, generated after build. It ties `WebSite.publisher` to the `LocalBusiness` node and declares the verified South Africa service area.
- Added `SiteSettingsService.resolved`, set only after the first settings request succeeds or fails. The hero may add a preload link only after that signal is true, only if no administrator hero exists, and only for a local `assets/` image. Administrator-configured hero URLs are never document-preloaded.
- The hero’s active image continues to use eager/high-priority image loading. The new preload flag is deliberately separate from eager loading so dynamic hero art is not accidentally promoted into a preload.
- `ImageLoaderComponent` and the homepage now use `OnPush`; the root navigation listener now uses `takeUntilDestroyed` rather than a manual unmanaged subscription.

## Verification

| Check | Result |
| --- | --- |
| Test-first sitemap/schema regression | Red observed when the expected primary brand mark was absent; green after implementation. |
| `node --test src/generate-sitemap.test.cjs` | Passed: 1/1 tests. |
| `npx tsc --noEmit -p tsconfig.website.json` | Passed (exit 0). |
| `npm run build` | Passed. Post-build sitemap/schema generation also passed. |
| Built `dist/navrik/index.html` | Verified one JSON-LD graph, the home canonical, and the canonical primary brand mark. |

The production build reports a **687.63 kB raw / 181.41 kB estimated-transfer initial total** (`main`: 643.32 kB raw / 166.42 kB estimated transfer). There is no valid before-build artifact attributable solely to this change—the shared workspace contains concurrent work—so no before/after bundle delta is claimed. An earlier build retry exposed a transient missing footer stylesheet from concurrent work; it was restored before the successful final build.

## Follow-up concerns

- Run a controlled homepage trace against this production build. The required evidence is LCP breakdown, CLS, and a visual check of the hero after both default and administrator-configured settings responses.
- This is a client-rendered SPA. Route-specific public metadata is updated on navigation; if crawler coverage for deep routes is a commercial priority, prerendering or server-rendered route documents would be a separate architecture decision.
