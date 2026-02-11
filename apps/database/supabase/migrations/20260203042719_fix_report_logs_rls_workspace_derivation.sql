-- Migration: Fix RLS policies for external_user_monthly_report_logs
-- Issue: Policies were incorrectly deriving workspace from user_id instead of group_id
-- The user_id refers to the external user being reported on, not the workspace
-- The group_id is the correct reference to workspace_user_groups which has ws_id

-- Drop existing incorrect RLS policies
DROP POLICY IF EXISTS "Allow view report logs" ON "public"."external_user_monthly_report_logs";
DROP POLICY IF EXISTS "Allow create report logs" ON "public"."external_user_monthly_report_logs";
DROP POLICY IF EXISTS "Allow update report logs" ON "public"."external_user_monthly_report_logs";
DROP POLICY IF EXISTS "Allow delete report logs" ON "public"."external_user_monthly_report_logs";

-- VIEW policy: users with view_user_groups_reports permission can SELECT
CREATE POLICY "Allow view report logs"
ON "public"."external_user_monthly_report_logs"
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  public.has_workspace_permission(
    (SELECT wug.ws_id FROM workspace_user_groups wug WHERE wug.id = external_user_monthly_report_logs.group_id),
    auth.uid(),
    'view_user_groups_reports'
  )
);

-- CREATE policy: users with create_user_groups_reports permission can INSERT
CREATE POLICY "Allow create report logs"
ON "public"."external_user_monthly_report_logs"
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_workspace_permission(
    (SELECT wug.ws_id FROM workspace_user_groups wug WHERE wug.id = external_user_monthly_report_logs.group_id),
    auth.uid(),
    'create_user_groups_reports'
  )
);

-- UPDATE policy: users with update_user_groups_reports permission can UPDATE
CREATE POLICY "Allow update report logs"
ON "public"."external_user_monthly_report_logs"
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (
  public.has_workspace_permission(
    (SELECT wug.ws_id FROM workspace_user_groups wug WHERE wug.id = external_user_monthly_report_logs.group_id),
    auth.uid(),
    'update_user_groups_reports'
  )
)
WITH CHECK (
  public.has_workspace_permission(
    (SELECT wug.ws_id FROM workspace_user_groups wug WHERE wug.id = external_user_monthly_report_logs.group_id),
    auth.uid(),
    'update_user_groups_reports'
  )
);

-- DELETE policy: users with delete_user_groups_reports permission can DELETE
CREATE POLICY "Allow delete report logs"
ON "public"."external_user_monthly_report_logs"
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (
  public.has_workspace_permission(
    (SELECT wug.ws_id FROM workspace_user_groups wug WHERE wug.id = external_user_monthly_report_logs.group_id),
    auth.uid(),
    'delete_user_groups_reports'
  )
);

-- Add comment explaining the fix
COMMENT ON TABLE public.external_user_monthly_report_logs IS 'Logs table for tracking report snapshots and approval history. RLS policies derive workspace from group_id (workspace_user_groups) not user_id (the external user being reported on).';
