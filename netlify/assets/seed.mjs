/**
 * Navrik DB Seed Script
 *
 * Run with: netlify dev exec node netlify/assets/seed.mjs
 * Or:       NETLIFY_DATABASE_URL="postgresql://..." node netlify/assets/seed.mjs
 *
 * Safe to run multiple times — all inserts are idempotent.
 * Also creates catalog tables if they don't exist yet.
 */

import { neon } from '@neondatabase/serverless';

const conn = process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL;

if (!conn) {
  console.error('\n❌  No database URL found in environment.');
  console.error('    Primary: netlify dev exec node netlify/assets/seed.mjs');
  console.error('    Manual:  NETLIFY_DATABASE_URL="postgresql://..." node netlify/assets/seed.mjs\n');
  process.exit(1);
}

const sql = neon(conn);

/* ──────────────────────────────────────────────────────────
   1. CATALOG PRODUCTS
   Base prices use Double Cab as the reference (delta = 0).
   The PDP size-selector applies these deltas client-side:
     Single Cab   +R 2 000
     Extra Cab    +R   500
     Double Cab   +R     0   ← reference
     D/Cab Short  −R 1 000
   ────────────────────────────────────────────────────────── */
const PRODUCTS = [
  {
    slug:         'navrik-standard-tray',
    name:         'Standard Aluminium Tray',
    category:     'tray',
    tray_type:    'standard',
    size:         null,             // null = show size selector on PDP
    color:        'silver',
    base_price:   30950.00,         // Double Cab reference
    coating_cost: 2750.00,          // applied when Black or White is selected
    description:  '2.5mm aluminium alloy tray with 920mm protective headboard, 240mm aluminium drop sides, full LED light kit, number plate bracket, and 3 support rails fitted.',
    image_url:    'assets/images/Standard Tray Center Silver.png',
    is_active:    true,
    sort_order:   10,
  },
  {
    slug:         'navrik-premium-tray',
    name:         'Premium Aluminium Tray',
    category:     'tray',
    tray_type:    'premium',
    size:         null,
    color:        'silver',
    base_price:   40950.00,
    coating_cost: 4150.00,
    description:  'Our flagship build — everything in Standard plus under-tray toolboxes, sequential LED indicator lights, and heavy-duty rear guard. The complete working platform.',
    image_url:    'assets/images/Premium Tray Center Silver.png',
    is_active:    true,
    sort_order:   20,
  },
];

/* ──────────────────────────────────────────────────────────
   1b. CANOPY MODELS
   5 tiers from the supplier lineup sheet. No confirmed ZAR
   pricing yet — base_price 0 means "quote only" on the PDP.
   image_url is a placeholder render cropped from the supplier
   sheet; gallery_urls are real Navrik-branded photos of the
   canopy shell shared across all tiers until each is
   individually photographed.
   ────────────────────────────────────────────────────────── */
const CANOPY_GALLERY = [
  'assets/canopies/canopy-showroom-isuzu-roofrack.jpg',
  'assets/canopies/canopy-isuzu-dmax-studio-rear-3q-roofrack.jpg',
  'assets/canopies/canopy-isuzu-dmax-studio-rear-3q.jpg',
  'assets/canopies/canopy-isuzu-dmax-studio-side-roofrack.jpg',
  'assets/canopies/canopy-install-red-isuzu-outdoor.jpg',
  'assets/canopies/canopy-install-red-bakkie-1.jpg',
  'assets/canopies/canopy-install-red-bakkie-2.jpg',
];
const VEHICLE_FIT = 'Isuzu D-Max (confirmed fit shown) — universal bracket kit, other models on request';

const CANOPIES = [
  {
    slug: 'navrik-canopy-adventure', name: 'Navrik Canopy — Adventure', size: 'Adventure',
    front_door_window: 'Glass, sliding window optional', side_door: 'Aluminium door with gullwing',
    rear_door: 'Half glass window with spoiler trail', sort_order: 30,
  },
  {
    slug: 'navrik-canopy-overland', name: 'Navrik Canopy — Overland', size: 'Overland',
    front_door_window: 'Glass, sliding window optional', side_door: 'Small glass with sliding window',
    rear_door: 'Half glass window, optional', sort_order: 31,
  },
  {
    slug: 'navrik-canopy-sports', name: 'Navrik Canopy — Sports', size: 'Sports',
    front_door_window: 'Glass, sliding window optional', side_door: 'Big glass with small sliding window',
    rear_door: 'Half glass window, optional', sort_order: 32,
  },
  {
    slug: 'navrik-canopy-defender', name: 'Navrik Canopy — Defender', size: 'Defender',
    front_door_window: 'Glass, sliding window optional', side_door: 'Aluminium door with gullwing',
    rear_door: 'Half glass window, optional', sort_order: 34,
  },
].map(c => ({
  category: 'canopy', tray_type: null, color: 'black',
  base_price: 0.00, coating_cost: 0.00,
  material: '5052 Aluminium Alloy', thickness: '2mm',
  description: `Navrik ${c.size} — a complete aluminium canopy build on 5052-grade alloy with 3-layer coating. Pricing available on request.`,
  image_url: `assets/canopies/models/canopy-model-${c.size.toLowerCase()}-placeholder.jpg`,
  gallery_urls: CANOPY_GALLERY,
  vehicle_fit: VEHICLE_FIT,
  is_active: true,
  ...c,
}));

/* ──────────────────────────────────────────────────────────
   2. CATALOG ACCESSORIES
   All four are optional upsells that can be bolted onto a
   Standard tray (they ship standard with Premium).
   ────────────────────────────────────────────────────────── */
const ACCESSORIES = [
  {
    slug:        'navrik-toolbox-single-drawer',
    name:        'Under-Tray Toolbox — Single Drawer',
    category:    'toolbox',
    price:       3500.00,
    description: 'Heavy-duty 2.5mm aluminium under-tray toolbox with a single locking pull-out drawer. Available matched to your tray finish.',
    image_url:   'assets/images/accessory-catalogue-1.png',
    sort_order:  10,
  },
  {
    slug:        'navrik-toolbox-double-drawer',
    name:        'Under-Tray Toolbox — Double Drawer',
    category:    'toolbox',
    price:       4200.00,
    description: 'Heavy-duty 2.5mm aluminium under-tray toolbox with dual locking pull-out drawers. Maximum under-tray storage capacity.',
    image_url:   'assets/images/accessory-catalogue-2.png',
    sort_order:  20,
  },
  {
    slug:        'navrik-sequential-led-kit',
    name:        'Sequential LED Light Kit',
    category:    'sequential_led',
    price:       1800.00,
    description: 'Dynamic sweeping sequential LED indicator strip. Upgrades your tray taillights with a high-visibility turn-signal effect.',
    sort_order:  30,
  },
  {
    slug:        'navrik-rear-guard',
    name:        'Heavy-Duty Rear Guard',
    category:    'rear_guard',
    price:       2800.00,
    description: 'Structural aluminium rear bumper guard with integrated anti-slip step plate. Protects the tray from loading impacts.',
    sort_order:  40,
  },
];

/* ──────────────────────────────────────────────────────────
   HELPERS
   ────────────────────────────────────────────────────────── */
const ok  = msg => console.log(`   ✓  ${msg}`);
const hdr = msg => console.log(`\n${msg}`);

/* ──────────────────────────────────────────────────────────
   MAIN
   ────────────────────────────────────────────────────────── */
async function seed() {
  console.log('\n🌱  Navrik DB seed starting…');

  // ── 0. Ensure catalog tables exist ────────────────────────
  hdr('🗄️   Ensuring catalog tables exist…');

  await sql`
    CREATE TABLE IF NOT EXISTS catalog_products (
      id            SERIAL        PRIMARY KEY,
      slug          TEXT          NOT NULL UNIQUE,
      name          TEXT          NOT NULL,
      category      TEXT          NOT NULL DEFAULT 'tray',
      tray_type     TEXT,
      size          TEXT,
      color         TEXT          NOT NULL DEFAULT 'silver',
      base_price    NUMERIC(10,2) NOT NULL DEFAULT 0.00,
      coating_cost  NUMERIC(10,2) NOT NULL DEFAULT 0.00,
      description   TEXT,
      image_url     TEXT,
      is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
      sort_order    INTEGER       NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `;
  ok('catalog_products');

  // Canopy-line additions (kept nullable/defaulted so tray rows are unaffected)
  await sql`ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS gallery_urls TEXT[] NOT NULL DEFAULT '{}'`;
  await sql`ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS material TEXT`;
  await sql`ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS thickness TEXT`;
  await sql`ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS front_door_window TEXT`;
  await sql`ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS side_door TEXT`;
  await sql`ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS rear_door TEXT`;
  await sql`ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS vehicle_fit TEXT`;
  ok('catalog_products canopy columns');

  await sql`
    CREATE TABLE IF NOT EXISTS catalog_accessories (
      id            SERIAL        PRIMARY KEY,
      slug          TEXT          NOT NULL UNIQUE,
      name          TEXT          NOT NULL,
      category      TEXT          NOT NULL,
      price         NUMERIC(10,2) NOT NULL DEFAULT 0.00,
      description   TEXT,
      image_url     TEXT,
      is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
      sort_order    INTEGER       NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `;
  ok('catalog_accessories');

  await sql`
    CREATE TABLE IF NOT EXISTS compatibility_matrix (
      id             SERIAL      PRIMARY KEY,
      accessory_id   INTEGER     NOT NULL REFERENCES catalog_accessories(id) ON DELETE CASCADE,
      tray_type      TEXT,
      product_id     INTEGER     REFERENCES catalog_products(id) ON DELETE SET NULL,
      vehicle_make   TEXT,
      vehicle_model  TEXT,
      notes          TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  ok('compatibility_matrix');

  // Unique constraint for idempotent compatibility rules
  await sql`
    ALTER TABLE compatibility_matrix
      DROP CONSTRAINT IF EXISTS compat_unique_rule
  `;
  await sql`
    ALTER TABLE compatibility_matrix
      ADD CONSTRAINT compat_unique_rule
      UNIQUE NULLS NOT DISTINCT (accessory_id, tray_type, vehicle_make, vehicle_model)
  `;
  ok('compatibility_matrix unique constraint');

  // ── 0b. Promo coupons + order/leads extensions ─────────────
  await sql`
    CREATE TABLE IF NOT EXISTS promo_coupons (
      id             SERIAL        PRIMARY KEY,
      code           TEXT          NOT NULL UNIQUE,
      description    TEXT,
      discount_type  TEXT          NOT NULL DEFAULT 'percent'
                       CHECK (discount_type IN ('percent', 'fixed')),
      discount_value NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
      min_order_zar  NUMERIC(10,2),
      max_uses       INTEGER,
      current_uses   INTEGER       NOT NULL DEFAULT 0,
      is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
      expires_at     TIMESTAMPTZ,
      created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      deleted_at     TIMESTAMPTZ
    )
  `;
  ok('promo_coupons');

  // Extend orders (safe – IF NOT EXISTS handles already-migrated DBs)
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_full_payment BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_id INTEGER REFERENCES promo_coupons(id)`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00`;
  ok('orders extended (coupon + is_full_payment columns)');

  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS admin_notes TEXT`;
  ok('leads extended (admin_notes column)');

  // ── 0c. Admin sessions ─────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id          SERIAL        PRIMARY KEY,
      token_hash  TEXT          NOT NULL UNIQUE,
      expires_at  TIMESTAMPTZ   NOT NULL,
      created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `;
  ok('admin_sessions');

  // ── 1. Products ────────────────────────────────────────────
  hdr('📦  Seeding catalog_products…');
  const productIds = {};

  for (const p of [...PRODUCTS, ...CANOPIES]) {
    const [row] = await sql`
      INSERT INTO catalog_products
        (slug, name, category, tray_type, size, color,
         base_price, coating_cost, description, image_url, is_active, sort_order,
         gallery_urls, material, thickness, front_door_window, side_door, rear_door, vehicle_fit)
      VALUES
        (${p.slug}, ${p.name}, ${p.category}, ${p.tray_type}, ${p.size}, ${p.color},
         ${p.base_price}, ${p.coating_cost}, ${p.description}, ${p.image_url},
         ${p.is_active}, ${p.sort_order},
         ${p.gallery_urls || []}, ${p.material || null}, ${p.thickness || null},
         ${p.front_door_window || null}, ${p.side_door || null}, ${p.rear_door || null},
         ${p.vehicle_fit || null})
      ON CONFLICT (slug) DO UPDATE SET
        name         = EXCLUDED.name,
        tray_type    = EXCLUDED.tray_type,
        base_price   = EXCLUDED.base_price,
        coating_cost = EXCLUDED.coating_cost,
        description  = EXCLUDED.description,
        is_active    = EXCLUDED.is_active,
        sort_order   = EXCLUDED.sort_order,
        updated_at   = NOW()
      RETURNING id, slug, name
    `;
    productIds[row.slug] = row.id;
    ok(`${row.name}  (id: ${row.id})`);
  }

  // ── 2. Accessories ─────────────────────────────────────────
  hdr('🔧  Seeding catalog_accessories…');
  const accessoryRows = [];

  for (const a of ACCESSORIES) {
    const [row] = await sql`
      INSERT INTO catalog_accessories
        (slug, name, category, price, description, image_url, is_active, sort_order)
      VALUES
        (${a.slug}, ${a.name}, ${a.category}, ${a.price}, ${a.description},
         ${a.image_url || null}, TRUE, ${a.sort_order})
      ON CONFLICT (slug) DO UPDATE SET
        name        = EXCLUDED.name,
        price       = EXCLUDED.price,
        description = EXCLUDED.description,
        image_url   = EXCLUDED.image_url,
        sort_order  = EXCLUDED.sort_order,
        updated_at  = NOW()
      RETURNING id, slug, name, category
    `;
    accessoryRows.push(row);
    ok(`${row.name}  (id: ${row.id})`);
  }

  // ── 3. Compatibility matrix ────────────────────────────────
  // These four accessories are upsells for the Standard tray.
  // Premium already includes them, so tray_type = 'standard' only.
  hdr('🔗  Seeding compatibility_matrix…');

  for (const acc of accessoryRows) {
    const rows = await sql`
      INSERT INTO compatibility_matrix
        (accessory_id, tray_type, product_id, vehicle_make, vehicle_model, notes)
      SELECT
        ${acc.id},
        'standard',
        NULL,
        NULL,
        NULL,
        'Standard-tray upsell — already included in Premium'
      WHERE NOT EXISTS (
        SELECT 1 FROM compatibility_matrix
        WHERE  accessory_id  = ${acc.id}
          AND  tray_type     = 'standard'
          AND  product_id    IS NULL
          AND  vehicle_make  IS NULL
          AND  vehicle_model IS NULL
      )
      RETURNING id
    `;
    ok(`${acc.name} → standard  (${rows.length ? 'inserted' : 'already exists'})`);
  }

  // ── Summary ───────────────────────────────────────────────
  console.log(`
✅  Seed complete!

   Listing:  /products
   Standard: /products/navrik-standard-tray
   Premium:  /products/navrik-premium-tray

   Upsell accessories appear on the Standard PDP only.
   The Premium PDP shows no upsells (they are already included).
`);
}

seed().catch(err => {
  console.error('\n❌  Seed failed:', err.message);
  process.exit(1);
});
