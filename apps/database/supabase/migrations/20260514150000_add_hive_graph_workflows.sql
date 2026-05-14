create table if not exists public.hive_workflows (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.hive_servers(id) on update cascade on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text,
  enabled boolean not null default true,
  version integer not null default 1 check (version > 0),
  definition jsonb not null default '{"version":1,"nodes":[],"edges":[]}'::jsonb,
  created_by uuid references public.users(id) on update cascade on delete set null,
  updated_by uuid references public.users(id) on update cascade on delete set null,
  archived_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.hive_workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.hive_workflows(id) on update cascade on delete cascade,
  server_id uuid not null references public.hive_servers(id) on update cascade on delete cascade,
  actor_user_id uuid references public.users(id) on update cascade on delete set null,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  step_trace jsonb not null default '[]'::jsonb,
  error text,
  started_at timestamp with time zone not null default now(),
  finished_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create index if not exists hive_workflows_server_enabled_idx
on public.hive_workflows (server_id, enabled, archived_at, updated_at desc);

create index if not exists hive_workflow_runs_workflow_created_idx
on public.hive_workflow_runs (workflow_id, created_at desc);

create index if not exists hive_workflow_runs_server_created_idx
on public.hive_workflow_runs (server_id, created_at desc);

alter table public.hive_workflows enable row level security;
alter table public.hive_workflow_runs enable row level security;

create policy "Hive members can read workflows"
on public.hive_workflows for select
to authenticated
using (
  (archived_at is null and public.is_hive_member())
  or public.is_hive_platform_admin()
);

create policy "Hive admins manage workflows"
on public.hive_workflows for all
to authenticated
using (public.is_hive_platform_admin())
with check (public.is_hive_platform_admin());

create policy "Hive members can read workflow runs"
on public.hive_workflow_runs for select
to authenticated
using (public.is_hive_member() or public.is_hive_platform_admin());

create policy "Hive members can insert workflow runs"
on public.hive_workflow_runs for insert
to authenticated
with check (public.is_hive_member() or public.is_hive_platform_admin());

create policy "Hive admins manage workflow runs"
on public.hive_workflow_runs for all
to authenticated
using (public.is_hive_platform_admin())
with check (public.is_hive_platform_admin());
