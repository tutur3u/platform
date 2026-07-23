alter type public.workspace_role_permission
  add value if not exists 'manage_user_report_automation';

alter type public.workspace_role_permission
  add value if not exists 'send_user_group_report_emails';

alter table private.external_user_monthly_reports
  add column if not exists cadence text not null default 'monthly',
  add column if not exists period_start date,
  add column if not exists period_end date,
  add column if not exists generation_mode text not null default 'manual',
  add column if not exists generation_status text not null default 'draft',
  add column if not exists source_context jsonb not null default '{}'::jsonb,
  add column if not exists manager_instruction text,
  add column if not exists delivery_status text not null default 'draft',
  add column if not exists delivery_requested_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists last_delivery_error text;

alter table private.external_user_monthly_reports
  drop constraint if exists external_user_monthly_reports_cadence_check,
  add constraint external_user_monthly_reports_cadence_check
    check (cadence in ('weekly', 'monthly', 'quarterly', 'yearly')),
  drop constraint if exists external_user_monthly_reports_period_check,
  add constraint external_user_monthly_reports_period_check
    check (
      (period_start is null and period_end is null)
      or (period_start is not null and period_end is not null and period_end >= period_start)
    ),
  drop constraint if exists external_user_monthly_reports_generation_mode_check,
  add constraint external_user_monthly_reports_generation_mode_check
    check (generation_mode in ('manual', 'ai')),
  drop constraint if exists external_user_monthly_reports_generation_status_check,
  add constraint external_user_monthly_reports_generation_status_check
    check (generation_status in ('draft', 'generating', 'ready', 'failed')),
  drop constraint if exists external_user_monthly_reports_delivery_status_check,
  add constraint external_user_monthly_reports_delivery_status_check
    check (delivery_status in ('draft', 'queued', 'processing', 'sent', 'failed', 'blocked', 'cancelled'));

drop view if exists private.external_user_monthly_reports_workspace_view;
create view private.external_user_monthly_reports_workspace_view as
select
  reports.*,
  report_user.ws_id as user_ws_id,
  report_user.full_name as user_full_name,
  report_user.display_name as user_display_name,
  report_user.email as user_email,
  report_user.archived as user_archived,
  report_user.archived_until as user_archived_until,
  report_user.note as user_note,
  report_group.ws_id as group_ws_id,
  report_group.name as group_name,
  creator.full_name as creator_full_name,
  creator.display_name as creator_display_name,
  creator.email as creator_email,
  modifier.full_name as modifier_full_name,
  modifier.display_name as modifier_display_name,
  modifier.email as modifier_email
from private.external_user_monthly_reports reports
left join public.workspace_users report_user
  on report_user.id = reports.user_id
left join public.workspace_user_groups report_group
  on report_group.id = reports.group_id
left join public.workspace_users creator
  on creator.id = reports.creator_id
left join public.workspace_users modifier
  on modifier.id = reports.updated_by;

revoke all on table private.external_user_monthly_reports_workspace_view
  from public, anon, authenticated;
grant select on table private.external_user_monthly_reports_workspace_view
  to service_role;

create index if not exists external_user_periodic_reports_period_idx
  on private.external_user_monthly_reports (group_id, cadence, period_start desc);

create index if not exists external_user_periodic_reports_delivery_idx
  on private.external_user_monthly_reports (delivery_status, delivery_requested_at)
  where delivery_status in ('queued', 'processing', 'failed');

create or replace function private.enforce_ai_report_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.generation_mode = 'ai' and tg_op = 'INSERT' then
    new.report_approval_status := 'PENDING';
    new.approved_by := null;
    new.approved_at := null;
    new.rejected_by := null;
    new.rejected_at := null;
    new.rejection_reason := null;
  elsif new.generation_mode = 'ai' and (
    new.content is distinct from old.content
    or new.feedback is distinct from old.feedback
    or (
      new.generation_status = 'ready'
      and new.generation_status is distinct from old.generation_status
    )
  ) then
    new.report_approval_status := 'PENDING';
    new.approved_by := null;
    new.approved_at := null;
    new.rejected_by := null;
    new.rejected_at := null;
    new.rejection_reason := null;
  end if;

  return new;
end;
$$;

drop trigger if exists zz_enforce_ai_report_review
  on private.external_user_monthly_reports;
create trigger zz_enforce_ai_report_review
before insert or update on private.external_user_monthly_reports
for each row
execute function private.enforce_ai_report_review();

create table if not exists private.user_report_schedules (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  group_id uuid references public.workspace_user_groups(id) on delete cascade,
  cadence text not null default 'monthly'
    check (cadence in ('weekly', 'monthly', 'quarterly', 'yearly')),
  generation_mode text not null default 'manual'
    check (generation_mode in ('manual', 'ai')),
  enabled boolean not null default false,
  timezone text,
  delivery_time time not null default '09:00:00',
  manager_instruction text,
  next_run_at timestamptz,
  locked_at timestamptz,
  locked_by text,
  created_by uuid references public.workspace_users(id) on delete set null,
  updated_by uuid references public.workspace_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not enabled or (timezone is not null and btrim(timezone) <> ''))
);

create unique index if not exists user_report_schedules_scope_cadence_idx
  on private.user_report_schedules (ws_id, coalesce(group_id, '00000000-0000-0000-0000-000000000000'::uuid), cadence);

create index if not exists user_report_schedules_due_idx
  on private.user_report_schedules (next_run_at)
  where enabled = true;

create table if not exists private.user_report_automation_runs (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references private.user_report_schedules(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  group_id uuid references public.workspace_user_groups(id) on delete cascade,
  cadence text not null check (cadence in ('weekly', 'monthly', 'quarterly', 'yearly')),
  generation_mode text not null check (generation_mode in ('manual', 'ai')),
  period_start date not null,
  period_end date not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_report_automation_runs_due_idx
  on private.user_report_automation_runs (next_attempt_at)
  where status in ('queued', 'failed');

create unique index if not exists user_report_automation_runs_scope_period_idx
  on private.user_report_automation_runs (
    schedule_id,
    coalesce(group_id, '00000000-0000-0000-0000-000000000000'::uuid),
    period_start,
    period_end
  );

create table if not exists private.user_report_email_queue (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references private.external_user_monthly_reports(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.workspace_users(id) on delete cascade,
  recipient_email text not null,
  delivery_kind text not null default 'send'
    check (delivery_kind in ('send', 'test')),
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'sent', 'failed', 'blocked', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  provider_message_id text,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_report_email_queue_due_idx
  on private.user_report_email_queue (next_attempt_at)
  where status in ('queued', 'failed');

create table if not exists private.user_report_email_attempts (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null references private.user_report_email_queue(id) on delete cascade,
  status text not null check (status in ('sent', 'failed', 'blocked')),
  provider_message_id text,
  error_message text,
  attempted_at timestamptz not null default now()
);

alter table private.user_report_schedules enable row level security;
alter table private.user_report_automation_runs enable row level security;
alter table private.user_report_email_queue enable row level security;
alter table private.user_report_email_attempts enable row level security;

revoke all on table
  private.user_report_schedules,
  private.user_report_automation_runs,
  private.user_report_email_queue,
  private.user_report_email_attempts
from public, anon, authenticated;

grant all on table
  private.user_report_schedules,
  private.user_report_automation_runs,
  private.user_report_email_queue,
  private.user_report_email_attempts
to service_role;

create or replace function private.claim_periodic_report_runs(
  p_worker_id text,
  p_limit integer default 10,
  p_now timestamptz default now()
)
returns setof private.user_report_automation_runs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select run.id
    from private.user_report_automation_runs run
    where run.status in ('queued', 'failed')
      and run.next_attempt_at <= p_now
      and (run.locked_at is null or run.locked_at < p_now - interval '15 minutes')
    order by run.next_attempt_at, run.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  )
  update private.user_report_automation_runs run
  set
    status = 'processing',
    locked_at = p_now,
    locked_by = p_worker_id,
    started_at = coalesce(run.started_at, p_now),
    attempt_count = run.attempt_count + 1,
    updated_at = p_now
  from candidates
  where run.id = candidates.id
  returning run.*;
end;
$$;

create or replace function private.claim_periodic_report_emails(
  p_worker_id text,
  p_limit integer default 10,
  p_now timestamptz default now()
)
returns setof private.user_report_email_queue
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select queue.id
    from private.user_report_email_queue queue
    where queue.status in ('queued', 'failed')
      and queue.next_attempt_at <= p_now
      and (queue.locked_at is null or queue.locked_at < p_now - interval '15 minutes')
    order by queue.next_attempt_at, queue.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  )
  update private.user_report_email_queue queue
  set
    status = 'processing',
    locked_at = p_now,
    locked_by = p_worker_id,
    attempt_count = queue.attempt_count + 1,
    updated_at = p_now
  from candidates
  where queue.id = candidates.id
  returning queue.*;
end;
$$;

revoke all on function private.claim_periodic_report_runs(text, integer, timestamptz)
  from public, anon, authenticated;
revoke all on function private.claim_periodic_report_emails(text, integer, timestamptz)
  from public, anon, authenticated;

grant execute on function private.claim_periodic_report_runs(text, integer, timestamptz)
  to service_role;
grant execute on function private.claim_periodic_report_emails(text, integer, timestamptz)
  to service_role;

create or replace function private.get_user_group_posts_status_summaries(
  p_ws_id uuid,
  p_group_id uuid,
  p_post_ids uuid[]
)
returns table (
  post_id uuid,
  completed_count bigint,
  total_count bigint,
  failed_count bigint,
  sent_count bigint,
  missing_check_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    requested.post_id,
    summary.completed_count,
    summary.total_count,
    summary.failed_count,
    summary.sent_count,
    summary.missing_check_count
  from unnest(coalesce(p_post_ids, array[]::uuid[])) as requested(post_id)
  cross join lateral private.get_user_group_post_status_summary(
    p_ws_id,
    p_group_id,
    requested.post_id
  ) summary;
$$;

revoke all on function private.get_user_group_posts_status_summaries(uuid, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function private.get_user_group_posts_status_summaries(uuid, uuid, uuid[])
  to service_role;

comment on table private.user_report_schedules is
  'Workspace defaults and optional per-group overrides for periodic user report generation.';
comment on table private.user_report_automation_runs is
  'Idempotent report-generation runs keyed by schedule and calendar period.';
comment on table private.user_report_email_queue is
  'Approval-gated periodic report deliveries to the subject workspace profile email.';
