-- Restrict administrative RPCs to their service-role callers. Report summaries
-- also enforce the application's report-view permission inside the definer.
-- This migration is independent of earlier privilege-hardening migrations.
-- Rollback: apps/database/rollbacks/20261027151400_restrict_remaining_privileged_definers.rollback.sql
begin;

do $migration$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'get_bounce_complaint_stats', 'get_workspace_overview_summary',
      'create_missing_personal_workspaces'
    )
  loop
    execute format('revoke all on function %s from public, anon, authenticated',fn);
    execute format('grant execute on function %s to service_role',fn);
  end loop;
end;
$migration$;

create or replace function public.get_group_report_status_summary(_ws_id uuid)
returns table (
  group_id uuid,
  pending_count bigint,
  approved_count bigint,
  rejected_count bigint
)
language plpgsql
stable
security definer
set search_path to public, private, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' and (
    auth.uid() is null or public.has_workspace_permission(
      _ws_id, auth.uid(), 'view_user_groups_reports'
    ) is not true
  ) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  return query
  select
    r.group_id,
    count(*) filter (where r.report_approval_status = 'PENDING') as pending_count,
    count(*) filter (where r.report_approval_status = 'APPROVED') as approved_count,
    count(*) filter (where r.report_approval_status = 'REJECTED') as rejected_count
  from private.external_user_monthly_reports r
  join public.workspace_user_groups g on g.id = r.group_id
  where g.ws_id = _ws_id
  group by r.group_id;
end;
$$;

create or replace function public.get_user_report_status_summary(
  _group_id uuid,
  _ws_id uuid
)
returns table (
  user_id uuid,
  pending_count bigint,
  approved_count bigint,
  rejected_count bigint
)
language plpgsql
stable
security definer
set search_path to public, private, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' and (
    auth.uid() is null or public.has_workspace_permission(
      _ws_id, auth.uid(), 'view_user_groups_reports'
    ) is not true
  ) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  return query
  select
    r.user_id,
    count(*) filter (where r.report_approval_status = 'PENDING') as pending_count,
    count(*) filter (where r.report_approval_status = 'APPROVED') as approved_count,
    count(*) filter (where r.report_approval_status = 'REJECTED') as rejected_count
  from private.external_user_monthly_reports r
  join public.workspace_user_groups g on g.id = r.group_id
  where r.group_id = _group_id
    and g.ws_id = _ws_id
  group by r.user_id;
end;
$$;

-- All first-party report-summary callers use createAdminClient. Authenticated
-- access is intentionally not granted; the guards remain a second boundary.
revoke all on function public.get_group_report_status_summary(uuid),
  public.get_user_report_status_summary(uuid,uuid) from public, anon, authenticated;
grant execute on function public.get_group_report_status_summary(uuid),
  public.get_user_report_status_summary(uuid,uuid) to service_role;

-- The legacy overloads still target public.notification_batches, which was
-- moved to private. All current SQL notification producers pass six arguments.
-- Refuse a destructive drop if a later change has repaired either old body.
do $migration$
declare
  signature text;
  fn regprocedure;
begin
  foreach signature in array array[
    'public.get_or_create_notification_batch(uuid,uuid,text,integer)',
    'public.get_or_create_notification_batch(uuid,uuid,text,integer,text)'
  ] loop
    fn := to_regprocedure(signature);
    if fn is null then continue; end if;
    if to_regclass('public.notification_batches') is not null
      or strpos(pg_get_functiondef(fn), 'public.notification_batches') = 0
    then
      raise exception 'Refusing to drop changed notification overload: %', signature;
    end if;
    execute format('drop function %s', fn);
  end loop;
end;
$migration$;
commit;
