-- Move dormant payroll execution records off direct authenticated Data API
-- access. Payroll remains server-owned until its dedicated API/UI is shipped;
-- service-role workflows and the workspace-user merge path retain access.

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

alter table if exists public.payroll_runs
  set schema private;

alter table if exists public.payroll_run_items
  set schema private;

revoke all on table
  private.payroll_runs,
  private.payroll_run_items
from public, anon, authenticated;

grant all on table
  private.payroll_runs,
  private.payroll_run_items
to service_role;

alter table private.payroll_runs enable row level security;
alter table private.payroll_run_items enable row level security;

drop policy if exists payroll_runs_select on private.payroll_runs;
drop policy if exists payroll_runs_insert on private.payroll_runs;
drop policy if exists payroll_runs_update on private.payroll_runs;
drop policy if exists payroll_runs_delete on private.payroll_runs;

drop policy if exists payroll_items_select on private.payroll_run_items;
drop policy if exists payroll_items_self_select on private.payroll_run_items;
drop policy if exists payroll_items_insert on private.payroll_run_items;
drop policy if exists payroll_items_update on private.payroll_run_items;
drop policy if exists payroll_items_delete on private.payroll_run_items;

create policy "Service role can manage private payroll runs"
  on private.payroll_runs
  for all
  to service_role
  using (true)
  with check (true);

create policy "Service role can manage private payroll run items"
  on private.payroll_run_items
  for all
  to service_role
  using (true)
  with check (true);

comment on table private.payroll_runs is
  'Private payroll execution records. Access is limited to service-role payroll workflows.';

comment on table private.payroll_run_items is
  'Private per-user payroll calculation records. Access is limited to service-role payroll workflows.';
