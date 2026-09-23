-- 0008: Reclaimable monthly-email delivery leases and exact-period Search Console snapshots.
-- Delivery leases allow a crashed serverless invocation to be retried without a
-- second active claimant. Search snapshots are keyed to the reporting period,
-- rather than overwriting the rolling dashboard cache.

ALTER TABLE monthly_report_deliveries
  ADD COLUMN IF NOT EXISTS attempt_started_at TIMESTAMPTZ;

UPDATE monthly_report_deliveries
SET attempt_started_at = COALESCE(attempt_started_at, updated_at, created_at)
WHERE send_state = 'sending';

CREATE INDEX IF NOT EXISTS idx_monthly_report_delivery_reclaim
  ON monthly_report_deliveries (attempt_started_at)
  WHERE send_state = 'sending';

CREATE TABLE IF NOT EXISTS search_console_monthly_snapshots (
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  payload      JSONB NOT NULL,
  source       TEXT NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (period_start, period_end),
  CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_search_console_monthly_snapshots_updated
  ON search_console_monthly_snapshots (updated_at DESC);
