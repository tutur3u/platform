BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Audit for the explicit admin choice on held periodic reports: approved, but
-- never requested for delivery. Additive and inert: it creates one private
-- table and two service-role functions, and reads or changes no report, queue
-- or config row. It queues nothing; held reports leave the held state only
-- through an admin's audited "Send now" (the existing
-- request_periodic_report_delivery pipeline) or "Skip" from the Reports
-- worklist.
create table if not exists private.periodic_report_held_actions (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  -- Auth user id of the admin. No foreign key, so the record outlives the account.
  actor_user_id uuid not null,
  action text not null check (action in ('send', 'skip')),
  cadence text not null
    check (cadence in ('weekly', 'monthly', 'quarterly', 'yearly')),
  period_start date,
  period_end date,
  group_id uuid,
  idempotency_key uuid not null,
  status text not null default 'started'
    check (status in ('started', 'completed', 'failed')),
  requested_count integer not null check (requested_count >= 0),
  affected_count integer not null default 0 check (affected_count >= 0),
  -- The reports actually queued or skipped, so a skip can be traced or undone.
  report_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint periodic_report_held_actions_scope_check
    check (period_start is not null or group_id is not null),
  constraint periodic_report_held_actions_period_check
    check ((period_start is null) = (period_end is null)
      and (period_start is null or period_start <= period_end)),
  constraint periodic_report_held_actions_idempotency_key
    unique (ws_id, idempotency_key)
);

create index if not exists periodic_report_held_actions_ws_created_idx
  on private.periodic_report_held_actions (ws_id, created_at desc);

comment on table private.periodic_report_held_actions is
  'Audited admin Send now / Skip choices for approved periodic reports that were never requested for delivery. Service role only.';

-- Service role only, like the other private delivery tables. No policies:
-- RLS denies every other role.
alter table private.periodic_report_held_actions enable row level security;
revoke all on table private.periodic_report_held_actions from public, anon, authenticated;
grant select, insert, update on table private.periodic_report_held_actions to service_role;

-- Send now for one held report. The held check and the enqueue run under the
-- same report row lock, so a concurrent Skip either commits first (and this
-- refuses) or waits and then finds the report queued (and leaves it alone).
-- Without it, a report skipped while a Send now batch is running would still
-- be queued, because the manual pipeline may send a skipped report.
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

COMMIT;
