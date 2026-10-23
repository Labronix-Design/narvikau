-- Existing legacy statuses are retained verbatim. Rollback must first archive or
-- explicitly map any new workflow statuses and archive follow-up data. Once
-- that is done, the schema rollback is:
-- ALTER TABLE leads DROP CONSTRAINT leads_status_check;
-- ALTER TABLE leads ADD CONSTRAINT leads_status_check CHECK (status IN ('new', 'contacted', 'quoted', 'converted', 'closed'));
-- ALTER TABLE leads DROP COLUMN follow_up_date, DROP COLUMN follow_up_note;
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check CHECK (status IN (
  'new', 'contacted', 'quoted', 'awaiting_customer_information', 'ready_to_quote',
  'quote_sent', 'quote_followed_up', 'follow_up_later', 'converted', 'closed'
));
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_date DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_note TEXT;
