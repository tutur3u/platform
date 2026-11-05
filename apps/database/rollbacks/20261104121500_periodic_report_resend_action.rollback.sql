-- Manual rollback only: restores the checks and held functions that
-- 20261104121500_periodic_report_resend_action.sql changed, and drops its
-- resend function. Deploy app code without the resend action first. It never
-- queues, cancels or sends anything. Refuses while resend audit rows exist:
-- export them first, since the restored checks cannot hold them.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- The lock comes first, so no resend row can be written between the check and the change.
-- tuturuuu: reviewed(dynamic-sql-review): fixed lock and read-only guard query, no EXECUTE or input.
DO $guard$
BEGIN
  LOCK TABLE private.periodic_report_held_actions IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (
    SELECT 1 FROM private.periodic_report_held_actions WHERE action = 'resend'
  ) THEN
    RAISE EXCEPTION 'resend audit rows exist; export them before rolling back';
  END IF;
END;
$guard$;

ALTER TABLE private.periodic_report_held_actions
  DROP CONSTRAINT IF EXISTS periodic_report_held_actions_cadence_required,
  DROP CONSTRAINT IF EXISTS periodic_report_held_actions_scope_check,
  ADD CONSTRAINT periodic_report_held_actions_scope_check
    CHECK (period_start IS NOT NULL OR group_id IS NOT NULL),
  DROP CONSTRAINT IF EXISTS periodic_report_held_actions_action_check,
  ADD CONSTRAINT periodic_report_held_actions_action_check
    CHECK (action IN ('send', 'skip'));
ALTER TABLE private.periodic_report_held_actions
  ALTER COLUMN cadence SET NOT NULL;

DROP FUNCTION IF EXISTS private.request_periodic_report_resend(uuid, uuid, text, boolean);

-- The held Send now and Skip functions exactly as 20261104120000 created them.
create or replace function private.request_held_periodic_report_delivery(
  p_report_id uuid, p_ws_id uuid, p_delivery_enabled boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  report private.external_user_monthly_reports%rowtype;
begin
  select r.* into report from private.external_user_monthly_reports r
    join public.workspace_users u on u.id = r.user_id
    join public.workspace_user_groups g on g.id = r.group_id
    where r.id = p_report_id and u.ws_id = p_ws_id and g.ws_id = p_ws_id
    for update of r;
  if not found then
    return jsonb_build_object('code', 404, 'message', 'Report not found.');
  end if;
  if report.delivery_status is distinct from 'draft'
     or report.report_approval_status is distinct from 'APPROVED'
     or report.delivered_at is not null
     or exists (select 1 from private.user_report_email_queue q
       where q.report_id = p_report_id and q.delivery_kind = 'send') then
    return jsonb_build_object('code', 409, 'message', 'This report is no longer held.');
  end if;
  return private.request_periodic_report_delivery(p_report_id, p_ws_id, 'send', p_delivery_enabled);
end;
$$;
revoke all on function private.request_held_periodic_report_delivery(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function private.request_held_periodic_report_delivery(uuid, uuid, boolean) to service_role;

-- Skip for held reports, scoped to the workspace by both the subject and the
-- class. Returns the ids actually skipped; anything no longer held is left.
create or replace function private.skip_held_periodic_reports(
  p_ws_id uuid, p_report_ids uuid[]
)
returns uuid[]
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  skipped uuid[];
begin
  with changed as (
    update private.external_user_monthly_reports r
      set delivery_status = 'skipped'
      from public.workspace_users u, public.workspace_user_groups g
      where r.id = any(p_report_ids)
        and u.id = r.user_id and u.ws_id = p_ws_id
        and g.id = r.group_id and g.ws_id = p_ws_id
        and r.delivery_status = 'draft'
        and r.report_approval_status = 'APPROVED'
        and r.delivered_at is null
        and not exists (select 1 from private.user_report_email_queue q
          where q.report_id = r.id and q.delivery_kind = 'send')
      returning r.id
  )
  select coalesce(array_agg(id), '{}') into skipped from changed;
  return skipped;
end;
$$;
revoke all on function private.skip_held_periodic_reports(uuid, uuid[]) from public, anon, authenticated;
grant execute on function private.skip_held_periodic_reports(uuid, uuid[]) to service_role;

COMMENT ON TABLE private.periodic_report_held_actions IS
  'Audited admin Send now / Skip choices for approved periodic reports that were never requested for delivery. Service role only.';

COMMIT;
