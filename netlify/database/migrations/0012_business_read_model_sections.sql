-- 0012: Independently invalidated business read-model sections.
--
-- This migration preserves all historical order data. It only broadens the
-- cache-row allowlist so that snapshots can be refreshed and invalidated
-- independently. Rollback: deploy the previous application, then remove only
-- the new cache rows before restoring the prior constraint; do not alter
-- historical orders or their cent values.

ALTER TABLE control_centre_cache
  DROP CONSTRAINT IF EXISTS control_centre_cache_section_check;

ALTER TABLE control_centre_cache
  ADD CONSTRAINT control_centre_cache_section_check CHECK (
    section IN (
      'business',
      'business_overview',
      'sales_performance',
      'orders',
      'enquiries',
      'search',
      'hosting'
    )
  );

-- `section` is the primary key and the existing partial invalidation index
-- covers stale-cache reads. No additional table-scan query is introduced.
