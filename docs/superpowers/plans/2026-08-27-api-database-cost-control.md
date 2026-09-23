# Navrik API and Database Cost-Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove runtime database schema work, restore reliable database-configured public content, and make public API reads durable-cache hits except after relevant authenticated mutations.

**Architecture:** Netlify Database migrations own every table, index, constraint, and singleton seed. Public functions are read-only and return tagged durable cache responses. Authenticated mutation functions update source/read-model data, then purge only the tags affected by that mutation after the transaction succeeds. Checkout and Yoco events retain their current narrow order snapshot invalidation.

**Tech Stack:** Angular 21.2, Netlify Functions (Node 22), Netlify Database with `@neondatabase/serverless`, Netlify durable CDN cache and `purgeCache`, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-27-api-database-cost-control-design.md`

## Global Constraints

- Do not add runtime DDL or schema-seeding SQL to any function.
- Use tagged-template SQL only; never construct SQL from request input.
- Do not expose purge credentials to Angular or return them in function output.
- Public cache purge happens only from authenticated/admin or trusted server mutation paths and only after a successful write.
- No scheduled cache rebuilds or public cache-bypass route.
- Do not modify already-applied migrations; create one additive migration for any missing singleton/read-model setup.
- All endpoint, environment, and database changes require security and QA review before handoff.

---

### Task 1: Establish migration-owned singleton data

**Files:**
- Create: `netlify/database/migrations/0016_public_content_singletons.sql`
- Modify: `netlify/functions/site-settings.js`
- Modify: `netlify/functions/legal-pages.js`
- Modify: `netlify/functions/finance-page.js`
- Modify: `netlify/functions/admin-site-settings.js`
- Modify: `netlify/functions/admin-legal-pages.js`
- Modify: `netlify/functions/admin-finance-page.js`
- Modify: `netlify/functions/admin-coupons.js`
- Test: `test/functions/public-schema-ownership.test.mjs`

**Interfaces:**
- Consumes: migrated `site_settings`, `legal_pages_settings`, `finance_page_settings`, and `promo_coupons` tables.
- Produces: public and admin functions that issue no `CREATE`, `ALTER`, `DROP`, or schema seed statement.

- [ ] **Step 1: Write failing schema-ownership tests**

```js
test('deployed request handlers contain no runtime DDL or schema seed writes', async () => {
  for (const file of PUBLIC_AND_ADMIN_FUNCTIONS) {
    const source = await readFile(new URL(`../../netlify/functions/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /CREATE\s+TABLE|ALTER\s+TABLE|CREATE\s+INDEX|DROP\s+CONSTRAINT/i);
  }
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run: `node --test test/functions/public-schema-ownership.test.mjs`

Expected: FAIL because `site-settings.js`, `legal-pages.js`, `finance-page.js`, and their admin counterparts contain `ensureSchema` helpers.

- [ ] **Step 3: Add the additive migration**

```sql
CREATE TABLE IF NOT EXISTS finance_page_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  content JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT finance_page_settings_singleton CHECK (id = 1)
);
INSERT INTO finance_page_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

INSERT INTO site_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
```

Include only idempotent schema/data setup that is absent from already-applied migrations, including the legal content table and active-code coupon index where inspection confirms it is required.

- [ ] **Step 4: Remove `ensureSchema`/`ensureCoupons` from request handlers**

Delete runtime schema helpers and their calls. Preserve normal business writes such as `UPDATE site_settings`, legal-page upserts, and coupon CRUD.

- [ ] **Step 5: Run the schema ownership tests**

Run: `node --test test/functions/public-schema-ownership.test.mjs`

Expected: PASS.

### Task 2: Introduce exact durable cache tags and purge boundary

**Files:**
- Modify: `netlify/functions/_public-cache.js`
- Modify: `netlify/functions/_catalogue-cache.js`
- Modify: `netlify/functions/site-settings.js`
- Modify: `netlify/functions/legal-pages.js`
- Modify: `netlify/functions/finance-page.js`
- Modify: `netlify/functions/promo-status.js`
- Create: `netlify/functions/_cache-invalidation.js`
- Test: `test/functions/public-read-cache.test.mjs`
- Test: `test/functions/cache-invalidation.test.mjs`

**Interfaces:**
- Produces: `taggedPublicReadHeaders({ tags, browserSeconds, cdnSeconds, staleSeconds })` and `purgePublicCacheTags(tags, purge)`.
- Consumes: `NETLIFY_PURGE_API_TOKEN` only inside server functions through Netlify’s `purgeCache` helper.

- [ ] **Step 1: Write failing cache contract tests**

```js
test('settings and catalogue responses carry exact durable tags and long TTLs', () => {
  const headers = taggedPublicReadHeaders({ tags: ['site-settings'], browserSeconds: 300, cdnSeconds: 604800, staleSeconds: 2592000 });
  assert.match(headers['Netlify-CDN-Cache-Control'], /durable/);
  assert.equal(headers['Netlify-Cache-Tag'], 'site-settings');
});

test('cache invalidation rejects wildcard and unknown tags', async () => {
  await assert.rejects(() => purgePublicCacheTags(['*'], purge), /Unknown public cache tag/);
});
```

- [ ] **Step 2: Run cache tests and verify they fail**

Run: `node --test test/functions/public-read-cache.test.mjs test/functions/cache-invalidation.test.mjs`

Expected: FAIL because tagged headers and exact purge helper do not yet exist.

- [ ] **Step 3: Implement tagged headers and server-only purge helper**

```js
const PUBLIC_CACHE_TAGS = new Set(['catalogue:products', 'catalogue:accessories', 'catalogue:categories', 'catalogue:compatibility', 'site-settings', 'legal:refund', 'legal:terms', 'finance-page', 'promo-status']);

export function taggedPublicReadHeaders({ tags, browserSeconds, cdnSeconds, staleSeconds }) {
  const requested = [...new Set(tags)];
  if (!requested.length || !requested.every((tag) => PUBLIC_CACHE_TAGS.has(tag))) throw new Error('Unknown public cache tag');
  return {
    'Cache-Control': `public, max-age=${browserSeconds}, stale-while-revalidate=${staleSeconds}`,
    'Netlify-CDN-Cache-Control': `public, durable, s-maxage=${cdnSeconds}, stale-while-revalidate=${staleSeconds}`,
    'Netlify-Cache-Tag': requested.join(','),
  };
}
```

Use the official server-side Netlify purge helper inside `_cache-invalidation.js`; never forward a token to the client.

- [ ] **Step 4: Apply response tags and TTLs**

Set catalogue/settings/legal/finance responses to one-week fresh + one-month stale. Keep promo status short-lived only when it reflects active inventory. Return `no-store` for rejected methods and unavailable states.

- [ ] **Step 5: Run cache tests**

Run: `node --test test/functions/public-read-cache.test.mjs test/functions/cache-invalidation.test.mjs`

Expected: PASS.

### Task 3: Attach precise purge calls to mutations

**Files:**
- Modify: `netlify/functions/admin-products.js`
- Modify: `netlify/functions/admin-accessories.js`
- Modify: `netlify/functions/admin-categories.js`
- Modify: `netlify/functions/admin-compatibility.js`
- Modify: `netlify/functions/admin-site-settings.js`
- Modify: `netlify/functions/admin-legal-pages.js`
- Modify: `netlify/functions/admin-finance-page.js`
- Modify: `netlify/functions/admin-coupons.js`
- Modify: `netlify/functions/create-checkout.js`
- Modify: `netlify/functions/yoco-webhook.js`
- Test: `test/functions/admin-cache-invalidation.test.mjs`
- Test: `test/functions/create-checkout.test.mjs`
- Test: `test/functions/yoco-webhook.test.mjs`

**Interfaces:**
- Consumes: `purgePublicCacheTags(tags, purge)` from Task 2.
- Produces: a post-commit exact purge mapping; no full-site purges.

- [ ] **Step 1: Write failing exact-tag tests**

```js
test('a product write rebuilds and purges only the product and compatibility public tags', async () => {
  const purged = [];
  await updateProduct({ ..., purgeTags: async (tags) => purged.push(tags) });
  assert.deepEqual(purged, [['catalogue:products', 'catalogue:compatibility']]);
});

test('a paid order purges promo status but not site settings or legal content', async () => {
  const purged = [];
  await processPaidOrder({ ..., purgeTags: async (tags) => purged.push(tags) });
  assert.deepEqual(purged, [['promo-status']]);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `node --test test/functions/admin-cache-invalidation.test.mjs test/functions/create-checkout.test.mjs test/functions/yoco-webhook.test.mjs`

Expected: FAIL because mutation handlers do not currently purge tagged CDN objects.

- [ ] **Step 3: Implement post-commit purge mapping**

Use these exact mappings:

```js
const MUTATION_TAGS = {
  product: ['catalogue:products', 'catalogue:compatibility'],
  accessory: ['catalogue:accessories', 'catalogue:compatibility'],
  category: ['catalogue:categories'],
  compatibility: ['catalogue:compatibility'],
  siteSettings: ['site-settings'],
  legalRefund: ['legal:refund'],
  legalTerms: ['legal:terms'],
  financePage: ['finance-page'],
  promo: ['promo-status'],
  paidOrder: ['promo-status'],
};
```

Call purge only after the database write/read-model rebuild succeeds. Preserve existing order snapshot invalidation and never make payment correctness depend on a purge succeeding.

- [ ] **Step 4: Run exact-tag tests**

Run: `node --test test/functions/admin-cache-invalidation.test.mjs test/functions/create-checkout.test.mjs test/functions/yoco-webhook.test.mjs`

Expected: PASS.

### Task 4: Make public failure states honest and customer-safe

**Files:**
- Modify: `netlify/functions/site-settings.js`
- Modify: `netlify/functions/legal-pages.js`
- Modify: `netlify/functions/finance-page.js`
- Modify: `src/website/_services/site-settings.service.ts`
- Modify: `src/website/_services/product.service.ts`
- Modify: `src/website/_services/accessory.service.ts`
- Test: `test/functions/public-content-failure.test.mjs`
- Test: `src/website/_services/site-settings.service.spec.ts`

**Interfaces:**
- Public function failure body: `{ error: 'Content is temporarily unavailable' }` with status `503` and no-store headers.
- Angular services expose their existing fallback only for explicit static/offline development configuration, not a production 500/503 response.

- [ ] **Step 1: Write failing public failure tests**

```js
test('a failed settings database read is non-cacheable 503, not a fabricated 200 default', async () => {
  const response = await handler({ httpMethod: 'GET' }, { getSql: () => failingSql });
  assert.equal(response.statusCode, 503);
  assert.match(response.headers['Cache-Control'], /no-store/);
});
```

- [ ] **Step 2: Run failure tests and verify they fail**

Run: `node --test test/functions/public-content-failure.test.mjs`

Expected: FAIL because current functions return 200 fallback payloads.

- [ ] **Step 3: Implement unavailable responses and Angular handling**

Return `503` only when the database read fails. Preserve a valid empty configured record as a real `200` response. Show a concise “We are refreshing this information” UI state rather than fake product/configuration content.

- [ ] **Step 4: Run public failure and Angular service tests**

Run: `node --test test/functions/public-content-failure.test.mjs && npm test -- --include='src/website/_services/site-settings.service.spec.ts'`

Expected: PASS, or document the Angular test-target limitation and run the configured equivalent.

### Task 5: Review and production-like verification

**Files:**
- Modify: `docs/superpowers/business-cache-models-report.md`
- Test: `test/functions/*.test.mjs`

- [ ] **Step 1: Update cache model documentation**

Document cache tags, mutation mappings, the absence of runtime schema work, and the requirement to use Netlify Dev with a safe Netlify Database branch for visual/API verification.

- [ ] **Step 2: Run the full function suite**

Run: `npm run test:functions`

Expected: PASS.

- [ ] **Step 3: Run TypeScript and production build**

Run: `npx tsc --noEmit -p tsconfig.website.json && npm run build`

Expected: PASS.

- [ ] **Step 4: Verify with Netlify Dev and a safe database branch**

Run: `netlify dev --port 8888` only after configuring the safe branch environment. Inspect `/api/site-settings`, `/api/catalog-products`, `/api/catalog-accessories`, and `/api/catalog-compatibility`; each must return real data with expected cache headers. Capture visual checks at 375px, 768px, and 1440px.

- [ ] **Step 5: Complete security and QA gates**

Security reviews all changed endpoints, migration handling, environment use, and cache purge boundaries. QA reruns the focused and full suites after any remediation. Do not deploy until both are clean and the user explicitly authorises deployment.
