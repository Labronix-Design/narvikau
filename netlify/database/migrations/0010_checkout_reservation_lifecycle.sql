-- 0010: Cent-authoritative payment expectations and reservation lifecycle.
--
-- This migration is additive. Rollback is recoverable by removing the added
-- indexes/triggers/columns only after the application has been rolled back;
-- do not remove cent values from historical orders.

-- Promo configuration and coupons retain the legacy decimal fields only so
-- existing admin screens continue to write successfully during the staged UI
-- migration. Checkout reads these materialised integer fields exclusively.
ALTER TABLE promo_config
  ADD COLUMN IF NOT EXISTS standard_installation_cost_cents INTEGER,
  ADD COLUMN IF NOT EXISTS discount_basis_points INTEGER,
  ADD COLUMN IF NOT EXISTS deposit_basis_points INTEGER;

UPDATE promo_config
SET standard_installation_cost_cents = ROUND(COALESCE(standard_installation_cost_zar, 0) * 100)::INTEGER,
    discount_basis_points = ROUND(COALESCE(discount_percent, 0) * 100)::INTEGER,
    deposit_basis_points = ROUND(COALESCE(deposit_percent, 0) * 100)::INTEGER
WHERE standard_installation_cost_cents IS NULL
   OR discount_basis_points IS NULL
   OR deposit_basis_points IS NULL;

ALTER TABLE promo_config
  ALTER COLUMN standard_installation_cost_cents SET DEFAULT 0,
  ALTER COLUMN standard_installation_cost_cents SET NOT NULL,
  ALTER COLUMN discount_basis_points SET DEFAULT 0,
  ALTER COLUMN discount_basis_points SET NOT NULL,
  ALTER COLUMN deposit_basis_points SET DEFAULT 0,
  ALTER COLUMN deposit_basis_points SET NOT NULL;

ALTER TABLE promo_config DROP CONSTRAINT IF EXISTS promo_config_standard_installation_cost_cents_check;
ALTER TABLE promo_config ADD CONSTRAINT promo_config_standard_installation_cost_cents_check CHECK (standard_installation_cost_cents >= 0);
ALTER TABLE promo_config DROP CONSTRAINT IF EXISTS promo_config_discount_basis_points_check;
ALTER TABLE promo_config ADD CONSTRAINT promo_config_discount_basis_points_check CHECK (discount_basis_points BETWEEN 0 AND 10000);
ALTER TABLE promo_config DROP CONSTRAINT IF EXISTS promo_config_deposit_basis_points_check;
ALTER TABLE promo_config ADD CONSTRAINT promo_config_deposit_basis_points_check CHECK (deposit_basis_points BETWEEN 0 AND 10000);

CREATE OR REPLACE FUNCTION sync_promo_config_checkout_cents()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.standard_installation_cost_cents := ROUND(COALESCE(NEW.standard_installation_cost_zar, 0) * 100)::INTEGER;
  NEW.discount_basis_points := ROUND(COALESCE(NEW.discount_percent, 0) * 100)::INTEGER;
  NEW.deposit_basis_points := ROUND(COALESCE(NEW.deposit_percent, 0) * 100)::INTEGER;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_promo_config_checkout_cents ON promo_config;
CREATE TRIGGER trg_promo_config_checkout_cents
  BEFORE INSERT OR UPDATE OF standard_installation_cost_zar, discount_percent, deposit_percent ON promo_config
  FOR EACH ROW EXECUTE FUNCTION sync_promo_config_checkout_cents();

ALTER TABLE promo_coupons
  ADD COLUMN IF NOT EXISTS min_order_cents INTEGER,
  ADD COLUMN IF NOT EXISTS fixed_discount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS discount_basis_points INTEGER;

UPDATE promo_coupons
SET min_order_cents = ROUND(COALESCE(min_order_zar, 0) * 100)::INTEGER,
    fixed_discount_cents = CASE WHEN discount_type = 'fixed' THEN ROUND(discount_value * 100)::INTEGER ELSE 0 END,
    discount_basis_points = CASE WHEN discount_type = 'percent' THEN ROUND(discount_value * 100)::INTEGER ELSE 0 END
WHERE min_order_cents IS NULL
   OR fixed_discount_cents IS NULL
   OR discount_basis_points IS NULL;

ALTER TABLE promo_coupons
  ALTER COLUMN min_order_cents SET DEFAULT 0,
  ALTER COLUMN min_order_cents SET NOT NULL,
  ALTER COLUMN fixed_discount_cents SET DEFAULT 0,
  ALTER COLUMN fixed_discount_cents SET NOT NULL,
  ALTER COLUMN discount_basis_points SET DEFAULT 0,
  ALTER COLUMN discount_basis_points SET NOT NULL;

ALTER TABLE promo_coupons DROP CONSTRAINT IF EXISTS promo_coupons_min_order_cents_check;
ALTER TABLE promo_coupons ADD CONSTRAINT promo_coupons_min_order_cents_check CHECK (min_order_cents >= 0);
ALTER TABLE promo_coupons DROP CONSTRAINT IF EXISTS promo_coupons_fixed_discount_cents_check;
ALTER TABLE promo_coupons ADD CONSTRAINT promo_coupons_fixed_discount_cents_check CHECK (fixed_discount_cents >= 0);
ALTER TABLE promo_coupons DROP CONSTRAINT IF EXISTS promo_coupons_discount_basis_points_check;
ALTER TABLE promo_coupons ADD CONSTRAINT promo_coupons_discount_basis_points_check CHECK (discount_basis_points BETWEEN 0 AND 10000);

CREATE OR REPLACE FUNCTION sync_promo_coupon_checkout_cents()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.min_order_cents := ROUND(COALESCE(NEW.min_order_zar, 0) * 100)::INTEGER;
  NEW.fixed_discount_cents := CASE WHEN NEW.discount_type = 'fixed' THEN ROUND(NEW.discount_value * 100)::INTEGER ELSE 0 END;
  NEW.discount_basis_points := CASE WHEN NEW.discount_type = 'percent' THEN ROUND(NEW.discount_value * 100)::INTEGER ELSE 0 END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_promo_coupon_checkout_cents ON promo_coupons;
CREATE TRIGGER trg_promo_coupon_checkout_cents
  BEFORE INSERT OR UPDATE OF discount_type, discount_value, min_order_zar ON promo_coupons
  FOR EACH ROW EXECUTE FUNCTION sync_promo_coupon_checkout_cents();

-- A checkout amount is stored once, in cents, after the server resolves the
-- live catalogue and pricing rules. The webhook never recomputes it.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_amount_cents INTEGER;

UPDATE orders
SET payment_amount_cents = CASE
  WHEN is_full_payment THEN COALESCE(total_incl_vat_cents, ROUND(COALESCE(total_incl_vat, 0) * 100)::INTEGER)
  ELSE COALESCE(deposit_amount_cents, 0)
END
WHERE payment_amount_cents IS NULL;

ALTER TABLE orders
  ALTER COLUMN payment_amount_cents SET DEFAULT 0,
  ALTER COLUMN payment_amount_cents SET NOT NULL;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_amount_cents_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_amount_cents_check CHECK (payment_amount_cents >= 0);

-- Coupon capacity is held for the same lifecycle as its pending checkout.
ALTER TABLE coupon_usage_reservations
  ADD COLUMN IF NOT EXISTS order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_coupon_usage_reservations_reserved_order
  ON coupon_usage_reservations (order_id)
  WHERE order_id IS NOT NULL AND state = 'reserved';
CREATE INDEX IF NOT EXISTS idx_coupon_usage_reservations_order_state
  ON coupon_usage_reservations (order_id, state);
CREATE INDEX IF NOT EXISTS idx_orders_pending_checkout_reservation
  ON orders (created_at)
  WHERE status = 'pending' AND yoco_checkout_id IS NOT NULL;

-- Released promo slots must stop consuming capacity in the operational view.
CREATE OR REPLACE VIEW promo_status AS
SELECT
  pc.max_promo_slots,
  pc.discount_percent,
  pc.standard_installation_cost_zar,
  pc.deposit_percent,
  pc.is_active,
  COUNT(ps.slot_number)::INTEGER AS slots_used,
  GREATEST(0, pc.max_promo_slots - COUNT(ps.slot_number)::INTEGER) AS slots_remaining,
  (COUNT(ps.slot_number)::INTEGER >= pc.max_promo_slots) AS promo_exhausted,
  COUNT(ps.confirmed_at)::INTEGER AS slots_confirmed
FROM promo_config pc
LEFT JOIN promo_slots ps ON ps.slot_number <= pc.max_promo_slots AND ps.released_at IS NULL
WHERE pc.is_active = TRUE
GROUP BY pc.max_promo_slots, pc.discount_percent,
         pc.standard_installation_cost_zar, pc.deposit_percent, pc.is_active;
