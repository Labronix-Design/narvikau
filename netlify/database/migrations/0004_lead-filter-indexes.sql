-- Apply after 0003. Support the authenticated enquiry queue's type/status
-- filters and newest-first ordering without requiring scans of all leads.
-- Rollback (no lead data is removed):
-- DROP INDEX IF EXISTS idx_leads_type_status_created;
-- DROP INDEX IF EXISTS idx_leads_status_created;
-- DROP INDEX IF EXISTS idx_leads_type_created;

BEGIN;

CREATE INDEX IF NOT EXISTS idx_leads_type_created
  ON leads (enquiry_type, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_leads_status_created
  ON leads (status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_leads_type_status_created
  ON leads (enquiry_type, status, created_at DESC, id DESC);

COMMIT;
