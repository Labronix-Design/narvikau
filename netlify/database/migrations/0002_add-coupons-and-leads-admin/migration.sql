-- 0002: Coupon management, extended orders, and lead admin notes

-- ─── promo_coupons ───────────────────────────────────────────────────────────
-- Code-based discount management. Separate from launch promo slots.
-- Soft delete via deleted_at; admin can toggle is_active without deletion.
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
);

CREATE TRIGGER trg_coupons_updated_at
  BEFORE UPDATE ON promo_coupons
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_coupons_code      ON promo_coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_is_active ON promo_coupons(is_active);

-- ─── extend orders ───────────────────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_full_payment         BOOLEAN       NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS coupon_id               INTEGER       REFERENCES promo_coupons(id),
  ADD COLUMN IF NOT EXISTS coupon_code             TEXT,
  ADD COLUMN IF NOT EXISTS coupon_discount_amount  NUMERIC(10,2) NOT NULL DEFAULT 0.00;

-- ─── extend leads ────────────────────────────────────────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;
