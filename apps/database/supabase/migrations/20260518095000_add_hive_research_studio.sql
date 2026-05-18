create table if not exists public.hive_research_sessions (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.hive_servers(id) on update cascade on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  description text,
  status text not null default 'running'
    check (status in ('running', 'paused', 'completed', 'archived')),
  created_by uuid references public.users(id) on update cascade on delete set null,
  started_at timestamp with time zone not null default now(),
  ended_at timestamp with time zone,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create unique index if not exists hive_research_sessions_one_running_idx
on public.hive_research_sessions (server_id)
where status = 'running';

create index if not exists hive_research_sessions_server_created_idx
on public.hive_research_sessions (server_id, created_at desc);

create table if not exists public.hive_research_session_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.hive_research_sessions(id) on update cascade on delete cascade,
  server_id uuid not null references public.hive_servers(id) on update cascade on delete cascade,
  actor_user_id uuid references public.users(id) on update cascade on delete set null,
  event_kind text not null,
  source_type text not null default 'system',
  source_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

create index if not exists hive_research_session_events_session_created_idx
on public.hive_research_session_events (session_id, created_at desc);

create index if not exists hive_research_session_events_server_created_idx
on public.hive_research_session_events (server_id, created_at desc);

alter table public.hive_world_events
  add column if not exists research_session_id uuid
  references public.hive_research_sessions(id) on update cascade on delete set null;

alter table public.hive_npc_runs
  add column if not exists research_session_id uuid
  references public.hive_research_sessions(id) on update cascade on delete set null;

alter table public.hive_workflow_runs
  add column if not exists research_session_id uuid
  references public.hive_research_sessions(id) on update cascade on delete set null;

alter table if exists public.hive_simulation_ticks
  add column if not exists research_session_id uuid
  references public.hive_research_sessions(id) on update cascade on delete set null;

create index if not exists hive_world_events_research_session_created_idx
on public.hive_world_events (research_session_id, created_at desc)
where research_session_id is not null;

create index if not exists hive_npc_runs_research_session_created_idx
on public.hive_npc_runs (research_session_id, created_at desc)
where research_session_id is not null;

create index if not exists hive_workflow_runs_research_session_created_idx
on public.hive_workflow_runs (research_session_id, created_at desc)
where research_session_id is not null;

do $$
begin
  if to_regclass('public.hive_simulation_ticks') is not null then
    create index if not exists hive_simulation_ticks_research_session_created_idx
    on public.hive_simulation_ticks (research_session_id, started_at desc)
    where research_session_id is not null;
  end if;
end $$;

alter table public.hive_research_sessions enable row level security;
alter table public.hive_research_session_events enable row level security;

create policy "Hive members can read research sessions"
on public.hive_research_sessions for select
to authenticated
using (public.is_hive_member() or public.is_hive_platform_admin());

create policy "Hive admins manage research sessions"
on public.hive_research_sessions for all
to authenticated
using (public.is_hive_platform_admin())
with check (public.is_hive_platform_admin());

create policy "Hive members can read research session events"
on public.hive_research_session_events for select
to authenticated
using (public.is_hive_member() or public.is_hive_platform_admin());

create policy "Hive admins manage research session events"
on public.hive_research_session_events for all
to authenticated
using (public.is_hive_platform_admin())
with check (public.is_hive_platform_admin());
