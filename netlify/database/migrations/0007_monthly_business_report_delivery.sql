-- 0007: Durable, idempotent internal monthly-report delivery records.
-- One recipient may receive a given report type and reporting period once.
-- `payload` is a business snapshot only: no credentials, tokens, or client invoice data.

CREATE TABLE IF NOT EXISTS monthly_report_deliveries (
  id                  BIGSERIAL PRIMARY KEY,
  report_type         TEXT NOT NULL CHECK (report_type IN ('monthly_business')),
  period_start        DATE NOT NULL,
  period_end          DATE NOT NULL,
  recipient           TEXT NOT NULL,
  send_state          TEXT NOT NULL DEFAULT 'sending' CHECK (send_state IN ('sending', 'sent', 'failed')),
  payload             JSONB NOT NULL,
  provider_message_id TEXT,
  sent_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start),
  UNIQUE (report_type, period_start, period_end, recipient)
);

CREATE INDEX IF NOT EXISTS idx_monthly_report_deliveries_sent_at
  ON monthly_report_deliveries (sent_at DESC)
  WHERE send_state = 'sent';
