-- Log report changes only after approval
DROP TRIGGER IF EXISTS trg_report_change_log ON public.external_user_monthly_reports;

CREATE TRIGGER trg_report_change_log
    AFTER UPDATE ON public.external_user_monthly_reports
    FOR EACH ROW
    WHEN (NEW.report_approval_status = 'APPROVED')
    EXECUTE FUNCTION public.log_report_change();

-- Update RLS policies on external_user_monthly_report_logs for report permissions
DROP POLICY IF EXISTS "Allow member managers to manage report logs" ON "public"."external_user_monthly_report_logs";
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
    (SELECT wu.ws_id FROM workspace_users wu WHERE wu.id = external_user_monthly_report_logs.user_id),
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
    (SELECT wu.ws_id FROM workspace_users wu WHERE wu.id = external_user_monthly_report_logs.user_id),
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
    (SELECT wu.ws_id FROM workspace_users wu WHERE wu.id = external_user_monthly_report_logs.user_id),
    auth.uid(),
    'update_user_groups_reports'
  )
)
WITH CHECK (
  public.has_workspace_permission(
    (SELECT wu.ws_id FROM workspace_users wu WHERE wu.id = external_user_monthly_report_logs.user_id),
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
    (SELECT wu.ws_id FROM workspace_users wu WHERE wu.id = external_user_monthly_report_logs.user_id),
    auth.uid(),
    'delete_user_groups_reports'
  )
);
