-- Navrik initial schema
-- Managed by Netlify Database — applied once, tracked automatically.

-- ─── extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── updated_at trigger function ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ─── customers ───────────────────────────────────────────────────────────────
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

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── promo_config ────────────────────────────────────────────────────────────
-- Single row governing launch-promo rules.
CREATE TABLE IF NOT EXISTS promo_config (
  id                              SERIAL        PRIMARY KEY,
  max_promo_slots                 INTEGER       NOT NULL DEFAULT 25,
  discount_percent                NUMERIC(5,2)  NOT NULL DEFAULT 5.00,
  standard_installation_cost_zar  NUMERIC(10,2) NOT NULL DEFAULT 2500.00,
  deposit_percent                 NUMERIC(5,2)  NOT NULL DEFAULT 20.00,
  is_active                       BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at                      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

INSERT INTO promo_config
  (id, max_promo_slots, discount_percent, standard_installation_cost_zar, deposit_percent, is_active)
VALUES
  (1, 25, 5.00, 2500.00, 20.00, TRUE)
ON CONFLICT (id) DO NOTHING;

-- ─── promo_slots ─────────────────────────────────────────────────────────────
-- One row per reserved promo slot. Promo applies when slot_number <= max_promo_slots.
CREATE TABLE IF NOT EXISTS promo_slots (
  slot_number     SERIAL       PRIMARY KEY,
  order_id        INTEGER,
  customer_email  TEXT         NOT NULL,
  customer_name   TEXT         NOT NULL,
  reserved_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  confirmed_at    TIMESTAMPTZ
);

-- ─── orders ──────────────────────────────────────────────────────────────────
-- All prices ZAR (NUMERIC 10,2). Listed prices are VAT-inclusive.
-- vat_amount = total_incl_vat x 15/115 (back-calculated from inclusive price).
CREATE TABLE IF NOT EXISTS orders (
  id                         SERIAL        PRIMARY KEY,
  customer_id                INTEGER       NOT NULL REFERENCES customers(id),

  -- Product
  product_type               TEXT          NOT NULL DEFAULT 'standard',
  product_size               TEXT          NOT NULL DEFAULT '',
  product_color              TEXT          NOT NULL DEFAULT 'silver',
  product_label              TEXT          NOT NULL DEFAULT '',

  -- Pricing
  base_price                 NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  coating_cost               NUMERIC(10,2) NOT NULL DEFAULT 0.00,

  -- Promo
  is_promo_order             BOOLEAN       NOT NULL DEFAULT FALSE,
  promo_slot_id              INTEGER       REFERENCES promo_slots(slot_number),
  discount_percent           NUMERIC(5,2)  NOT NULL DEFAULT 0.00,
  discount_amount            NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  installation_cost          NUMERIC(10,2) NOT NULL DEFAULT 0.00,

  -- Invoice (VAT back-calculated: vat_amount = total_incl_vat x 15/115)
  amount_excl_vat            NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  vat_rate                   NUMERIC(6,4)  NOT NULL DEFAULT 0.1500,
  vat_amount                 NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  total_incl_vat             NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  order_total                NUMERIC(10,2) NOT NULL DEFAULT 0.00,

  -- Deposit
  deposit_percent            NUMERIC(5,2)  NOT NULL DEFAULT 20.00,
  deposit_amount_cents       INTEGER       NOT NULL DEFAULT 0,
  balance_due                NUMERIC(10,2) NOT NULL DEFAULT 0.00,

  -- Payment
  yoco_checkout_id           TEXT,
  yoco_payment_id            TEXT,
  deposit_paid_at            TIMESTAMPTZ,
  deposit_paid_amount_cents  INTEGER,

  status                     TEXT          NOT NULL DEFAULT 'pending'
                               CHECK (status IN (
                                 'pending','deposit_paid','in_production',
                                 'ready','completed','cancelled','failed'
                               )),
  payment_method             TEXT          NOT NULL DEFAULT 'yoco',

  -- Audit
  ip_address                 TEXT,
  notes                      TEXT,
  created_at                 TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── order_audit_log ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_audit_log (
  id            BIGSERIAL   PRIMARY KEY,
  order_id      INTEGER     NOT NULL REFERENCES orders(id),
  event         TEXT        NOT NULL,
  old_status    TEXT,
  new_status    TEXT,
  amount_cents  INTEGER,
  payload       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── leads ───────────────────────────────────────────────────────────────────
-- Contact form + accessories quote submissions.
CREATE TABLE IF NOT EXISTS leads (
  id          SERIAL        PRIMARY KEY,
  source      TEXT          NOT NULL CHECK (source IN ('contact_form','accessories_quote')),
  name        TEXT,
  email       TEXT,
  phone       TEXT,
  company     TEXT,
  product     TEXT,
  message     TEXT,
  status      TEXT          NOT NULL DEFAULT 'new'
                CHECK (status IN ('new','contacted','quoted','converted','closed')),
  customer_id INTEGER       REFERENCES customers(id),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_customers_email       ON customers(email);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id    ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status         ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_is_promo       ON orders(is_promo_order);
CREATE INDEX IF NOT EXISTS idx_orders_yoco_checkout  ON orders(yoco_checkout_id);
CREATE INDEX IF NOT EXISTS idx_orders_yoco_payment   ON orders(yoco_payment_id);
CREATE INDEX IF NOT EXISTS idx_promo_slots_order     ON promo_slots(order_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_order       ON order_audit_log(order_id);
CREATE INDEX IF NOT EXISTS idx_leads_email           ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_source          ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_status          ON leads(status);

-- ─── views ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW promo_status AS
SELECT
  pc.max_promo_slots,
  pc.discount_percent,
  pc.standard_installation_cost_zar,
  pc.deposit_percent,
  pc.is_active,
  COUNT(ps.slot_number)::INTEGER                                    AS slots_used,
  GREATEST(0, pc.max_promo_slots - COUNT(ps.slot_number)::INTEGER)  AS slots_remaining,
  (COUNT(ps.slot_number)::INTEGER >= pc.max_promo_slots)            AS promo_exhausted,
  COUNT(ps.confirmed_at)::INTEGER                                   AS slots_confirmed
FROM promo_config pc
LEFT JOIN promo_slots ps ON ps.slot_number <= pc.max_promo_slots
WHERE pc.is_active = TRUE
GROUP BY pc.max_promo_slots, pc.discount_percent,
         pc.standard_installation_cost_zar, pc.deposit_percent, pc.is_active;

CREATE OR REPLACE VIEW order_invoice AS
SELECT
  o.id                                                        AS order_id,
  o.created_at::DATE                                          AS order_date,
  c.first_name || ' ' || c.last_name                          AS customer_name,
  c.email                                                     AS customer_email,
  c.phone                                                     AS customer_phone,
  o.product_label,
  o.base_price,
  o.coating_cost,
  o.base_price + o.coating_cost                               AS gross_subtotal,
  o.is_promo_order,
  o.promo_slot_id,
  o.discount_percent,
  o.discount_amount,
  o.installation_cost,
  o.amount_excl_vat,
  ROUND(o.vat_rate * 100, 2)                                  AS vat_percent,
  o.vat_amount,
  o.total_incl_vat,
  o.deposit_percent,
  ROUND(o.deposit_amount_cents::NUMERIC / 100, 2)             AS deposit_amount,
  o.balance_due,
  o.deposit_paid_at,
  ROUND(o.deposit_paid_amount_cents::NUMERIC / 100, 2)        AS deposit_paid_amount,
  o.status,
  o.yoco_payment_id
FROM orders o
JOIN customers c ON c.id = o.customer_id;
