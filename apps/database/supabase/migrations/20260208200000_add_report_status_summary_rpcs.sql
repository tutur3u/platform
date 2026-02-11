-- RPC: get_group_report_status_summary
-- Returns per-group counts of PENDING, APPROVED, REJECTED reports for a workspace.
CREATE OR REPLACE FUNCTION public.get_group_report_status_summary(_ws_id UUID)
RETURNS TABLE (
  group_id UUID,
  pending_count BIGINT,
  approved_count BIGINT,
  rejected_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    r.group_id,
    COUNT(*) FILTER (WHERE r.report_approval_status = 'PENDING') AS pending_count,
    COUNT(*) FILTER (WHERE r.report_approval_status = 'APPROVED') AS approved_count,
    COUNT(*) FILTER (WHERE r.report_approval_status = 'REJECTED') AS rejected_count
  FROM external_user_monthly_reports r
  JOIN workspace_user_groups g ON g.id = r.group_id
  WHERE g.ws_id = _ws_id
  GROUP BY r.group_id;
$$;

-- RPC: get_user_report_status_summary
-- Returns per-user counts of PENDING, APPROVED, REJECTED reports within a specific group.
CREATE OR REPLACE FUNCTION public.get_user_report_status_summary(_group_id UUID, _ws_id UUID)
RETURNS TABLE (
  user_id UUID,
  pending_count BIGINT,
  approved_count BIGINT,
  rejected_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    r.user_id,
    COUNT(*) FILTER (WHERE r.report_approval_status = 'PENDING') AS pending_count,
    COUNT(*) FILTER (WHERE r.report_approval_status = 'APPROVED') AS approved_count,
    COUNT(*) FILTER (WHERE r.report_approval_status = 'REJECTED') AS rejected_count
  FROM external_user_monthly_reports r
  JOIN workspace_user_groups g ON g.id = r.group_id
  WHERE r.group_id = _group_id
    AND g.ws_id = _ws_id
  GROUP BY r.user_id;
$$;

-- Composite index to accelerate grouping by group_id + status
CREATE INDEX IF NOT EXISTS idx_external_user_monthly_reports_group_status
ON external_user_monthly_reports (group_id, report_approval_status);
