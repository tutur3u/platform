create or replace function private.get_periodic_report_counts(
  p_ws_id uuid,
  p_cadence text default 'monthly',
  p_group_ids uuid[] default null::uuid[]
)
returns table (
  total bigint,
  draft bigint,
  pending_review bigint,
  approved bigint,
  delivered bigint,
  failed bigint,
  blocked bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*)::bigint as total,
    count(*) filter (
      where report.generation_status = 'draft'
    )::bigint as draft,
    count(*) filter (
      where report.report_approval_status = 'PENDING'
    )::bigint as pending_review,
    count(*) filter (
      where report.report_approval_status = 'APPROVED'
    )::bigint as approved,
    count(*) filter (
      where report.delivery_status = 'sent'
    )::bigint as delivered,
    count(*) filter (
      where report.delivery_status = 'failed'
    )::bigint as failed,
    count(*) filter (
      where report.delivery_status = 'blocked'
    )::bigint as blocked
  from private.external_user_monthly_reports_workspace_view report
  where report.user_ws_id = p_ws_id
    and report.cadence = p_cadence
    and (
      p_group_ids is null
      or report.group_id = any(p_group_ids)
    );
$$;

create or replace function private.skip_rejected_post_email_queue()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated bigint := 0;
begin
  update public.post_email_queue queue
  set
    status = 'skipped',
    batch_id = null,
    claimed_at = null,
    cancelled_at = now(),
    last_error = 'Post was rejected - auto-skipped'
  from private.user_group_post_checks check_row
  where check_row.post_id = queue.post_id
    and check_row.user_id = queue.user_id
    and check_row.approval_status = 'REJECTED'
    and queue.status = 'queued';

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function private.get_periodic_report_counts(uuid, text, uuid[])
  from public, anon, authenticated;
revoke all on function private.skip_rejected_post_email_queue()
  from public, anon, authenticated;

grant execute on function private.get_periodic_report_counts(uuid, text, uuid[])
  to service_role;
grant execute on function private.skip_rejected_post_email_queue()
  to service_role;

comment on function private.get_periodic_report_counts(uuid, text, uuid[]) is
  'Returns exact periodic report status aggregates without PostgREST row limits.';
comment on function private.skip_rejected_post_email_queue() is
  'Set-wise maintenance for queued daily report emails whose recipient review was rejected.';

notify pgrst, 'reload schema';
