-- 0004: one-time PKCE state and encrypted Search Console refresh token storage.
-- Plain OAuth codes, verifiers, refresh tokens, and client secrets are never stored.

CREATE TABLE IF NOT EXISTS gsc_oauth_states (
  state_hash          TEXT PRIMARY KEY,
  verifier_ciphertext TEXT NOT NULL,
  expires_at          TIMESTAMPTZ NOT NULL,
  consumed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gsc_oauth_states_expiry
  ON gsc_oauth_states (expires_at);

CREATE TABLE IF NOT EXISTS gsc_oauth_grants (
  id                       SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  refresh_token_ciphertext TEXT NOT NULL,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
