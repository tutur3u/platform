-- Drop existing foreign key constraint without CASCADE
ALTER TABLE "public"."external_user_monthly_reports" 
  DROP CONSTRAINT IF EXISTS "external_user_monthly_reports_group_id_fkey";

-- Add new foreign key constraint with ON DELETE CASCADE
-- This ensures that when a user group is deleted, all associated monthly reports are also deleted
ALTER TABLE "public"."external_user_monthly_reports" 
  ADD CONSTRAINT "external_user_monthly_reports_group_id_fkey" 
  FOREIGN KEY (group_id) 
  REFERENCES workspace_user_groups(id) 
  ON DELETE CASCADE;
