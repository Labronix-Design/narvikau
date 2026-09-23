-- 0014: Single-use, non-guessable entitlements for warranty registration.
--
-- Tokens are issued only after a paid-order confirmation. Only a SHA-256 hash
-- is retained, so database exposure cannot be used to submit a warranty claim.
-- This migration is additive and leaves existing orders untouched.

CREATE TABLE IF NOT EXISTS warranty_registration_tokens (
  order_id    INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  token_hash  CHAR(64) NOT NULL UNIQUE,
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_warranty_registration_tokens_unused
  ON warranty_registration_tokens (token_hash)
  WHERE used_at IS NULL;
