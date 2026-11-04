-- Audit for the explicit admin choice on held periodic reports: approved, but
-- never requested for delivery. Additive and inert: it creates one private
-- table and reads or changes no report, queue or config row. It queues
-- nothing; held reports leave the held state only through an admin's audited
-- "Send now" (the existing request_periodic_report_delivery pipeline) or
-- "Skip" from the Reports worklist.
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
