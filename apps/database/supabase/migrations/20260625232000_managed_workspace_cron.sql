-- Managed workspace cron endpoint execution.
-- Jobs stay workspace-owned, while scheduler egress is constrained by a
-- private, employee-managed domain allowlist.

alter table public.workspace_cron_jobs
  alter column dataset_id drop not null;

alter table public.workspace_cron_jobs
  add column if not exists endpoint_url text,
  add column if not exists http_method text not null default 'GET',
  add column if not exists headers_config jsonb not null default '[]'::jsonb,
  add column if not exists timeout_ms integer not null default 15000,
  add column if not exists retry_count integer not null default 0,
  add column if not exists next_run_at timestamp with time zone,
  add column if not exists last_run_at timestamp with time zone,
  add column if not exists locked_at timestamp with time zone,
  add column if not exists locked_by text,
  add column if not exists failure_count integer not null default 0,
  add column if not exists last_status text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_cron_jobs_http_method_check'
      and conrelid = 'public.workspace_cron_jobs'::regclass
  ) then
    alter table public.workspace_cron_jobs
      add constraint workspace_cron_jobs_http_method_check
      check (http_method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_cron_jobs_headers_config_array_check'
      and conrelid = 'public.workspace_cron_jobs'::regclass
  ) then
    alter table public.workspace_cron_jobs
      add constraint workspace_cron_jobs_headers_config_array_check
      check (jsonb_typeof(headers_config) = 'array');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_cron_jobs_timeout_ms_check'
      and conrelid = 'public.workspace_cron_jobs'::regclass
  ) then
    alter table public.workspace_cron_jobs
      add constraint workspace_cron_jobs_timeout_ms_check
      check (timeout_ms between 1000 and 60000);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_cron_jobs_retry_count_check'
      and conrelid = 'public.workspace_cron_jobs'::regclass
  ) then
    alter table public.workspace_cron_jobs
      add constraint workspace_cron_jobs_retry_count_check
      check (retry_count between 0 and 3);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_cron_jobs_failure_count_check'
      and conrelid = 'public.workspace_cron_jobs'::regclass
  ) then
    alter table public.workspace_cron_jobs
      add constraint workspace_cron_jobs_failure_count_check
      check (failure_count >= 0);
  end if;
end $$;

create index if not exists workspace_cron_jobs_due_idx
  on public.workspace_cron_jobs (active, next_run_at)
  where endpoint_url is not null;

create index if not exists workspace_cron_jobs_locked_at_idx
  on public.workspace_cron_jobs (locked_at)
  where locked_at is not null;

alter table public.workspace_cron_executions
  add column if not exists http_status integer,
  add column if not exists duration_ms integer,
  add column if not exists error text,
  add column if not exists endpoint_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_cron_executions_duration_ms_check'
      and conrelid = 'public.workspace_cron_executions'::regclass
  ) then
    alter table public.workspace_cron_executions
      add constraint workspace_cron_executions_duration_ms_check
      check (duration_ms is null or duration_ms >= 0);
  end if;
end $$;

create table if not exists private.managed_cron_whitelisted_domains (
  domain text primary key,
  description text,
  enabled boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

alter table private.managed_cron_whitelisted_domains enable row level security;

revoke all on table private.managed_cron_whitelisted_domains from anon;
revoke all on table private.managed_cron_whitelisted_domains from authenticated;
grant all on table private.managed_cron_whitelisted_domains to service_role;

drop policy if exists "Service role can manage managed cron whitelisted domains"
  on private.managed_cron_whitelisted_domains;

create policy "Service role can manage managed cron whitelisted domains"
  on private.managed_cron_whitelisted_domains
  for all
  to service_role
  using (true)
  with check (true);

comment on table private.managed_cron_whitelisted_domains is
  'Private egress allowlist for managed workspace cron endpoint execution. Mutate through apps/web employee-only admin APIs.';
