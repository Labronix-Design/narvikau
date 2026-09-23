-- =============================================================
-- Navrik — Neon PostgreSQL Migration
-- Idempotent: safe to run multiple times against any state
-- Apply via: psql $NETLIFY_DATABASE_URL -f db-migrate.sql
-- =============================================================

-- -------------------------------------------------------
-- EXTENSIONS
-- -------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================
-- TABLE: customers
-- =============================================================
CREATE TABLE IF NOT EXISTS customers (
  id            SERIAL       PRIMARY KEY,
  first_name    TEXT         NOT NULL,
  last_name     TEXT         NOT NULL DEFAULT '',
  email         TEXT         NOT NULL UNIQUE,
  phone         TEXT,
  vehicle_make  TEXT,
  vehicle_model TEXT,
  vehicle_year  SMALLINT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Idempotent column additions for existing tables
ALTER TABLE customers ADD COLUMN IF NOT EXISTS vehicle_make  TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS vehicle_model TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS vehicle_year  SMALLINT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- =============================================================
-- TABLE: promo_config
-- Single row governing all launch-promo rules.
-- =============================================================
CREATE TABLE IF NOT EXISTS promo_config (
  id                               SERIAL        PRIMARY KEY,
  max_promo_slots                  INTEGER       NOT NULL DEFAULT 25,
  discount_percent                 NUMERIC(5,2)  NOT NULL DEFAULT 5.00,
  standard_installation_cost_zar   NUMERIC(10,2) NOT NULL DEFAULT 2500.00,
  deposit_percent                  NUMERIC(5,2)  NOT NULL DEFAULT 20.00,
  is_active                        BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at                       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at                       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Seed the one config row — never overwrite existing values
INSERT INTO promo_config
  (id, max_promo_slots, discount_percent, standard_installation_cost_zar, deposit_percent, is_active)
VALUES
  (1,  25,              5.00,             2500.00,                         20.00,           TRUE)
ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- TABLE: promo_slots
-- One row per reserved promo slot. slot_number auto-increments;
-- promo applies only when slot_number <= max_promo_slots.
-- The INSERT ... SELECT in create-checkout.js atomically
-- reserves a slot only while count < max_promo_slots.
-- =============================================================
CREATE TABLE IF NOT EXISTS promo_slots (
  slot_number     SERIAL       PRIMARY KEY,
  order_id        INTEGER,                    -- FK set after order row created
  customer_email  TEXT         NOT NULL,
  customer_name   TEXT         NOT NULL,
  reserved_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  confirmed_at    TIMESTAMPTZ               -- set when Yoco deposit confirmed
);

-- =============================================================
-- TABLE: orders
-- Full pricing breakdown + payment tracking + audit columns.
-- Prices in ZAR (NUMERIC 10,2); Yoco amounts in cents (INTEGER).
-- All listed product prices are VAT-inclusive (standard SA retail).
-- vat_amount is back-calculated: total_incl_vat × 15/115.
-- =============================================================
CREATE TABLE IF NOT EXISTS orders (
  id                         SERIAL        PRIMARY KEY,
  customer_id                INTEGER       NOT NULL REFERENCES customers(id),

  -- Product
  product_type               TEXT          NOT NULL DEFAULT 'standard',  -- 'standard' | 'premium'
  product_size               TEXT          NOT NULL DEFAULT '',           -- 'single-cab' etc.
  product_color              TEXT          NOT NULL DEFAULT 'silver',     -- 'silver' | 'black' | 'white'
  product_label              TEXT          NOT NULL DEFAULT '',           -- human-readable heading

  -- Pricing (ZAR, VAT-inclusive throughout)
  base_price                 NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  coating_cost               NUMERIC(10,2) NOT NULL DEFAULT 0.00,

  -- Promo
  is_promo_order             BOOLEAN       NOT NULL DEFAULT FALSE,
  promo_slot_id              INTEGER,
  discount_percent           NUMERIC(5,2)  NOT NULL DEFAULT 0.00,
  discount_amount            NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  installation_cost          NUMERIC(10,2) NOT NULL DEFAULT 0.00,

  -- Invoice totals (VAT-inclusive prices, VAT back-calculated)
  amount_excl_vat            NUMERIC(10,2) NOT NULL DEFAULT 0.00,  -- total_incl_vat × 100/115
  vat_rate                   NUMERIC(6,4)  NOT NULL DEFAULT 0.1500, -- statutory 15%
  vat_amount                 NUMERIC(10,2) NOT NULL DEFAULT 0.00,   -- total_incl_vat × 15/115
  total_incl_vat             NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  order_total                NUMERIC(10,2) NOT NULL DEFAULT 0.00,   -- alias for backward compat

  -- Deposit (20% of total_incl_vat, rounded to nearest rand)
  deposit_percent            NUMERIC(5,2)  NOT NULL DEFAULT 20.00,
  deposit_amount_cents       INTEGER       NOT NULL DEFAULT 0,      -- what Yoco charges
  balance_due                NUMERIC(10,2) NOT NULL DEFAULT 0.00,

  -- Yoco
  yoco_checkout_id           TEXT,
  yoco_payment_id            TEXT,
  deposit_paid_at            TIMESTAMPTZ,
  deposit_paid_amount_cents  INTEGER,

  -- Lifecycle
  status                     TEXT          NOT NULL DEFAULT 'pending',
  payment_method             TEXT          NOT NULL DEFAULT 'yoco',

  -- Audit metadata
  ip_address                 TEXT,
  user_agent                 TEXT,
  notes                      TEXT,
  created_at                 TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Idempotent column additions
ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_type               TEXT          NOT NULL DEFAULT 'standard';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_size               TEXT          NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_color              TEXT          NOT NULL DEFAULT 'silver';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_label              TEXT          NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS base_price                 NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coating_cost               NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_promo_order             BOOLEAN       NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_slot_id              INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_percent           NUMERIC(5,2)  NOT NULL DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount            NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS installation_cost          NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_excl_vat            NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_rate                   NUMERIC(6,4)  NOT NULL DEFAULT 0.1500;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_amount                 NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_incl_vat             NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deposit_percent            NUMERIC(5,2)  NOT NULL DEFAULT 20.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deposit_amount_cents       INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS balance_due                NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS yoco_checkout_id           TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS yoco_payment_id            TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deposit_paid_at            TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deposit_paid_amount_cents  INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ip_address                 TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_agent                 TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes                      TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- FK: orders.promo_slot_id → promo_slots.slot_number
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'orders_promo_slot_id_fkey'
       AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_promo_slot_id_fkey
      FOREIGN KEY (promo_slot_id) REFERENCES promo_slots(slot_number);
  END IF;
END $$;

-- Status CHECK (drop + recreate so it stays in sync)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD  CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending', 'deposit_paid', 'in_production',
    'ready', 'completed', 'cancelled', 'failed'
  ));

-- =============================================================
-- TABLE: order_audit_log  — immutable event stream
-- =============================================================
CREATE TABLE IF NOT EXISTS order_audit_log (
  id            BIGSERIAL   PRIMARY KEY,
  order_id      INTEGER     NOT NULL REFERENCES orders(id),
  event         TEXT        NOT NULL,  -- 'order_created' | 'deposit_paid' | 'promo_awarded' | ...
  old_status    TEXT,
  new_status    TEXT,
  amount_cents  INTEGER,
  payload       JSONB,                 -- raw webhook or event context
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- INDEXES
-- =============================================================
CREATE INDEX IF NOT EXISTS idx_customers_email        ON customers(email);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id     ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status          ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_is_promo        ON orders(is_promo_order);
CREATE INDEX IF NOT EXISTS idx_orders_yoco_checkout   ON orders(yoco_checkout_id);
CREATE INDEX IF NOT EXISTS idx_orders_yoco_payment    ON orders(yoco_payment_id);
CREATE INDEX IF NOT EXISTS idx_promo_slots_order      ON promo_slots(order_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_order        ON order_audit_log(order_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_event        ON order_audit_log(event);

-- =============================================================
-- TRIGGER: keep updated_at current automatically
-- =============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_updated_at    ON orders;
DROP TRIGGER IF EXISTS trg_customers_updated_at ON customers;

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================
-- VIEW: promo_status — quick dashboard for promo availability
-- =============================================================
CREATE OR REPLACE VIEW promo_status AS
SELECT
  pc.max_promo_slots,
  pc.discount_percent,
  pc.standard_installation_cost_zar,
  pc.deposit_percent,
  pc.is_active,
  COUNT(ps.slot_number)::INTEGER                                  AS slots_used,
  GREATEST(0, pc.max_promo_slots - COUNT(ps.slot_number)::INTEGER) AS slots_remaining,
  (COUNT(ps.slot_number)::INTEGER >= pc.max_promo_slots)          AS promo_exhausted,
  COUNT(ps.confirmed_at)::INTEGER                                 AS slots_confirmed
FROM promo_config pc
LEFT JOIN promo_slots ps
       ON ps.slot_number <= pc.max_promo_slots
WHERE pc.is_active = TRUE
GROUP BY
  pc.max_promo_slots,
  pc.discount_percent,
  pc.standard_installation_cost_zar,
  pc.deposit_percent,
  pc.is_active;

-- =============================================================
-- VIEW: order_invoice — denormalised invoice per order
-- =============================================================
CREATE OR REPLACE VIEW order_invoice AS
SELECT
  o.id                                                       AS order_id,
  o.created_at::DATE                                         AS order_date,
  c.first_name || ' ' || c.last_name                         AS customer_name,
  c.email                                                    AS customer_email,
  c.phone                                                    AS customer_phone,
  o.product_label,
  o.base_price,
  o.coating_cost,
  o.base_price + o.coating_cost                              AS gross_subtotal,
  o.is_promo_order,
  o.promo_slot_id,
  o.discount_percent,
  o.discount_amount,
  o.installation_cost,
  o.amount_excl_vat,
  ROUND(o.vat_rate * 100, 2)                                 AS vat_percent,
  o.vat_amount,
  o.total_incl_vat,
  o.deposit_percent,
  ROUND(o.deposit_amount_cents::NUMERIC / 100, 2)            AS deposit_amount,
  o.balance_due,
  o.deposit_paid_at,
  ROUND(o.deposit_paid_amount_cents::NUMERIC / 100, 2)       AS deposit_paid_amount,
  o.status,
  o.yoco_payment_id
FROM orders o
JOIN customers c ON c.id = o.customer_id;

-- =============================================================
-- TABLE: leads — website form submissions (contact + quote)
-- Every form on the site writes here so no enquiry is lost
-- even if the email fails.
-- =============================================================
CREATE TABLE IF NOT EXISTS leads (
  id          SERIAL        PRIMARY KEY,
  source      TEXT          NOT NULL,          -- 'contact_form' | 'accessories_quote'
  name        TEXT,
  email       TEXT,
  phone       TEXT,
  company     TEXT,                            -- dealership name (contact form)
  product     TEXT,                            -- accessory name (quote form)
  message     TEXT,
  status      TEXT          NOT NULL DEFAULT 'new',
  customer_id INTEGER       REFERENCES customers(id),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

ALTER TABLE leads ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads ADD  CONSTRAINT leads_status_check
  CHECK (status IN ('new', 'contacted', 'quoted', 'converted', 'closed'));

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE leads ADD  CONSTRAINT leads_source_check
  CHECK (source IN ('contact_form', 'accessories_quote'));

CREATE INDEX IF NOT EXISTS idx_leads_email   ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_source  ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_status  ON leads(status);

DROP TRIGGER IF EXISTS trg_leads_updated_at ON leads;
CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================
-- TABLE: catalog_products  — Admin-managed product catalog
-- Trays and canopies as distinct SKUs with pricing authority.
-- =============================================================
CREATE TABLE IF NOT EXISTS catalog_products (
  id            SERIAL        PRIMARY KEY,
  slug          TEXT          NOT NULL UNIQUE,
  name          TEXT          NOT NULL,
  category      TEXT          NOT NULL DEFAULT 'tray',   -- 'tray' | 'canopy'
  tray_type     TEXT,                                    -- 'standard' | 'premium' (null for canopies)
  size          TEXT,                                    -- 'single-cab' | 'extra-cab' | 'double-cab' | 'double-cab-short'
  color         TEXT          NOT NULL DEFAULT 'silver', -- 'silver' | 'black' | 'white'
  base_price    NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  coating_cost  NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  description   TEXT,
  image_url     TEXT,
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  sort_order    INTEGER       NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS slug         TEXT;
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS name         TEXT;
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS category     TEXT NOT NULL DEFAULT 'tray';
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS tray_type    TEXT;
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS size         TEXT;
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS color        TEXT NOT NULL DEFAULT 'silver';
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS base_price   NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS coating_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS description  TEXT;
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS image_url    TEXT;
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS is_active    BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS sort_order   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE catalog_products DROP CONSTRAINT IF EXISTS catalog_products_category_check;
ALTER TABLE catalog_products ADD  CONSTRAINT catalog_products_category_check
  CHECK (category IN ('tray', 'canopy'));

ALTER TABLE catalog_products DROP CONSTRAINT IF EXISTS catalog_products_tray_type_check;
ALTER TABLE catalog_products ADD  CONSTRAINT catalog_products_tray_type_check
  CHECK (tray_type IN ('standard', 'premium') OR tray_type IS NULL);

ALTER TABLE catalog_products DROP CONSTRAINT IF EXISTS catalog_products_color_check;
ALTER TABLE catalog_products ADD  CONSTRAINT catalog_products_color_check
  CHECK (color IN ('silver', 'black', 'white'));

-- =============================================================
-- TABLE: catalog_accessories  — Toolboxes, drop sides, LEDs, etc.
-- =============================================================
CREATE TABLE IF NOT EXISTS catalog_accessories (
  id            SERIAL        PRIMARY KEY,
  slug          TEXT          NOT NULL UNIQUE,
  name          TEXT          NOT NULL,
  category      TEXT          NOT NULL,  -- 'toolbox' | 'drop_side' | 'sequential_led' | 'rear_guard' | 'canopy'
  price         NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  description   TEXT,
  image_url     TEXT,
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  sort_order    INTEGER       NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

ALTER TABLE catalog_accessories ADD COLUMN IF NOT EXISTS slug        TEXT;
ALTER TABLE catalog_accessories ADD COLUMN IF NOT EXISTS name        TEXT;
ALTER TABLE catalog_accessories ADD COLUMN IF NOT EXISTS category    TEXT;
ALTER TABLE catalog_accessories ADD COLUMN IF NOT EXISTS price       NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE catalog_accessories ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE catalog_accessories ADD COLUMN IF NOT EXISTS image_url   TEXT;
ALTER TABLE catalog_accessories ADD COLUMN IF NOT EXISTS is_active   BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE catalog_accessories ADD COLUMN IF NOT EXISTS sort_order  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE catalog_accessories ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE catalog_accessories DROP CONSTRAINT IF EXISTS catalog_accessories_category_check;
ALTER TABLE catalog_accessories ADD  CONSTRAINT catalog_accessories_category_check
  CHECK (category IN ('toolbox', 'drop_side', 'sequential_led', 'rear_guard', 'canopy'));

-- =============================================================
-- TABLE: compatibility_matrix
-- Maps accessories to product configurations and/or vehicle models.
-- A NULL vehicle_make/model means "compatible with all vehicles".
-- A NULL tray_type means "compatible with all tray types".
-- =============================================================
CREATE TABLE IF NOT EXISTS compatibility_matrix (
  id             SERIAL      PRIMARY KEY,
  accessory_id   INTEGER     NOT NULL REFERENCES catalog_accessories(id) ON DELETE CASCADE,
  tray_type      TEXT,       -- 'standard' | 'premium' | NULL (all)
  product_id     INTEGER     REFERENCES catalog_products(id) ON DELETE SET NULL,
  vehicle_make   TEXT,       -- NULL = all makes
  vehicle_model  TEXT,       -- NULL = all models
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE compatibility_matrix ADD COLUMN IF NOT EXISTS accessory_id  INTEGER;
ALTER TABLE compatibility_matrix ADD COLUMN IF NOT EXISTS tray_type     TEXT;
ALTER TABLE compatibility_matrix ADD COLUMN IF NOT EXISTS product_id    INTEGER;
ALTER TABLE compatibility_matrix ADD COLUMN IF NOT EXISTS vehicle_make  TEXT;
ALTER TABLE compatibility_matrix ADD COLUMN IF NOT EXISTS vehicle_model TEXT;
ALTER TABLE compatibility_matrix ADD COLUMN IF NOT EXISTS notes         TEXT;

ALTER TABLE compatibility_matrix DROP CONSTRAINT IF EXISTS compat_tray_type_check;
ALTER TABLE compatibility_matrix ADD  CONSTRAINT compat_tray_type_check
  CHECK (tray_type IN ('standard', 'premium') OR tray_type IS NULL);

-- Unique: one rule per accessory + tray_type + vehicle combo
ALTER TABLE compatibility_matrix DROP CONSTRAINT IF EXISTS compat_unique_rule;
ALTER TABLE compatibility_matrix ADD  CONSTRAINT compat_unique_rule
  UNIQUE NULLS NOT DISTINCT (accessory_id, tray_type, vehicle_make, vehicle_model);

-- =============================================================
-- INDEXES: catalog tables
-- =============================================================
CREATE INDEX IF NOT EXISTS idx_catalog_products_slug      ON catalog_products(slug);
CREATE INDEX IF NOT EXISTS idx_catalog_products_active    ON catalog_products(is_active);
CREATE INDEX IF NOT EXISTS idx_catalog_products_category  ON catalog_products(category);
CREATE INDEX IF NOT EXISTS idx_catalog_accessories_slug   ON catalog_accessories(slug);
CREATE INDEX IF NOT EXISTS idx_catalog_accessories_active ON catalog_accessories(is_active);
CREATE INDEX IF NOT EXISTS idx_compat_accessory           ON compatibility_matrix(accessory_id);
CREATE INDEX IF NOT EXISTS idx_compat_tray_type           ON compatibility_matrix(tray_type);

-- =============================================================
-- TRIGGERS: keep updated_at current on catalog tables
-- =============================================================
DROP TRIGGER IF EXISTS trg_catalog_products_updated_at    ON catalog_products;
DROP TRIGGER IF EXISTS trg_catalog_accessories_updated_at ON catalog_accessories;

CREATE TRIGGER trg_catalog_products_updated_at
  BEFORE UPDATE ON catalog_products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_catalog_accessories_updated_at
  BEFORE UPDATE ON catalog_accessories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================
-- TABLE: admin_sessions  — Lightweight session token store
-- =============================================================
CREATE TABLE IF NOT EXISTS admin_sessions (
  id         SERIAL      PRIMARY KEY,
  token_hash TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_exp   ON admin_sessions(expires_at);

-- =============================================================
-- ORDERS: add is_full_payment column
-- =============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_full_payment BOOLEAN NOT NULL DEFAULT FALSE;

-- =============================================================
-- END OF MIGRATION
-- =============================================================
