-- 0013: Post-purchase warranty registrations.
--
-- This migration is additive and does not change historical orders. A
-- registration may link to an existing order only when the public reference
-- and purchaser email agree; the raw reference remains available for
-- purchases that were not created through online checkout.
--
-- Rollback: deploy the prior application, then DROP INDEX and DROP TABLE
-- warranty_registrations. Existing orders and customers are untouched.

CREATE TABLE IF NOT EXISTS warranty_registrations (
  id                    BIGSERIAL PRIMARY KEY,
  registration_reference TEXT NOT NULL UNIQUE,
  order_id              INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  purchaser_name        TEXT NOT NULL,
  purchaser_email       TEXT NOT NULL,
  purchaser_phone       TEXT NOT NULL,
  product_name          TEXT NOT NULL,
  order_reference       TEXT,
  vehicle_make          TEXT NOT NULL,
  vehicle_model         TEXT NOT NULL,
  vehicle_year          SMALLINT NOT NULL CHECK (vehicle_year BETWEEN 1900 AND 2100),
  vehicle_registration  TEXT NOT NULL,
  purchase_date         DATE NOT NULL,
  fitment_date          DATE NOT NULL,
  consent_at            TIMESTAMPTZ NOT NULL,
  registered_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (fitment_date >= purchase_date)
);

-- The public registration endpoint reads by a verified numeric reference and
-- email before insert. At most one warranty may be linked to one order.
CREATE UNIQUE INDEX IF NOT EXISTS idx_warranty_registrations_linked_order
  ON warranty_registrations (order_id)
  WHERE order_id IS NOT NULL;

-- Admin pages read newest registrations first; this avoids a table scan as
-- the warranty register grows.
CREATE INDEX IF NOT EXISTS idx_warranty_registrations_registered_at
  ON warranty_registrations (registered_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_warranty_registrations_email
  ON warranty_registrations (purchaser_email);
