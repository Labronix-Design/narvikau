-- 0015: Read-time expiry for checkout reservations.
--
-- Until now, a promo slot or coupon hold left behind by an abandoned checkout
-- only stopped consuming capacity when the `checkout-reservation-reaper`
-- scheduled function next ran. That made customer-visible availability a
-- function of how often the cron fired, which forced a 15-minute schedule and
-- kept the database compute awake around the clock — the managed Postgres
-- plan meters compute *active time*, so a frequent unconditional cron is the
-- most expensive thing a mostly-idle site can do.
--
-- Expiry is therefore derived at read time from the reservation's own age and
-- the state of its order. The reaper still runs, hourly, to physically release
-- rows and write the audit trail, but correctness no longer depends on it.
--
-- This migration is additive: it adds one function and one view, and redefines
-- `promo_status` with the same column list it already had. Rollback is the
-- previous `promo_status` definition from 0010.

-- The single source of truth for how long an unpaid checkout may hold capacity.
-- Kept in SQL so the views below and the application agree on one window.
CREATE OR REPLACE FUNCTION checkout_reservation_ttl()
RETURNS INTERVAL LANGUAGE sql IMMUTABLE AS $$
  SELECT INTERVAL '30 minutes'
$$;

-- A promo slot is stale when it is still held, was never confirmed, is older
-- than the reservation window, and its order can no longer complete. The order
-- predicate deliberately mirrors the reaper's: only an unpaid pending order
-- that reached Yoco is treated as expired, so the two never disagree about
-- which rows are dead. A slot with no order at all is an abandoned checkout
-- that died between reserving the slot and writing its order row.
CREATE OR REPLACE VIEW stale_checkout_promo_slots AS
SELECT slot.slot_number
FROM promo_slots slot
LEFT JOIN orders order_row ON order_row.id = slot.order_id
WHERE slot.released_at IS NULL
  AND slot.confirmed_at IS NULL
  AND slot.reserved_at < NOW() - checkout_reservation_ttl()
  AND (
    slot.order_id IS NULL
    OR order_row.id IS NULL
    OR (
      order_row.status = 'pending'
      AND order_row.yoco_checkout_id IS NOT NULL
      AND order_row.created_at < NOW() - checkout_reservation_ttl()
    )
  );

-- `promo_status` now discounts stale slots, so the storefront and the admin
-- control centre report the capacity a customer could actually claim right now
-- rather than the capacity the last cron run happened to leave behind.
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
LEFT JOIN promo_slots ps
  ON ps.slot_number <= pc.max_promo_slots
 AND ps.released_at IS NULL
 AND NOT EXISTS (
   SELECT 1 FROM stale_checkout_promo_slots stale WHERE stale.slot_number = ps.slot_number
 )
WHERE pc.is_active = TRUE
GROUP BY pc.max_promo_slots, pc.discount_percent,
         pc.standard_installation_cost_zar, pc.deposit_percent, pc.is_active;

-- Coupon holds left by abandoned checkouts are released the same way. The
-- reaper only knows about reservations that were successfully linked to an
-- order; this covers the ones whose checkout died before that link was made.
CREATE OR REPLACE VIEW stale_coupon_usage_reservations AS
SELECT reservation.id, reservation.coupon_id
FROM coupon_usage_reservations reservation
LEFT JOIN orders order_row ON order_row.id = reservation.order_id
WHERE reservation.state = 'reserved'
  AND reservation.created_at < NOW() - checkout_reservation_ttl()
  AND (
    reservation.order_id IS NULL
    OR order_row.id IS NULL
    OR (
      order_row.status = 'pending'
      AND order_row.yoco_checkout_id IS NOT NULL
      AND order_row.created_at < NOW() - checkout_reservation_ttl()
    )
  );
