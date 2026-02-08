-- Deduplicate external_user_monthly_reports
-- This CTE identifies duplicates and ranks them by updated_at (newest first).
-- We want to keep the one with rn = 1.
WITH duplicates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, group_id, title
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) as rn
  FROM external_user_monthly_reports
)
DELETE FROM external_user_monthly_reports
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Add unique index on (user_id, group_id, title)
-- This ensures that no new duplicates can be created.
CREATE UNIQUE INDEX IF NOT EXISTS idx_external_user_monthly_reports_unique_report
ON external_user_monthly_reports (user_id, group_id, title);

-- Add constraint using the unique index
ALTER TABLE external_user_monthly_reports
DROP CONSTRAINT IF EXISTS external_user_monthly_reports_user_id_group_id_title_key;

ALTER TABLE external_user_monthly_reports
ADD CONSTRAINT external_user_monthly_reports_user_id_group_id_title_key
UNIQUE USING INDEX idx_external_user_monthly_reports_unique_report;
