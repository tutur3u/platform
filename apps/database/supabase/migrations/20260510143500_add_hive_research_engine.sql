set check_function_bodies = off;

create table if not exists public.hive_members (
  user_id uuid primary key references public.users(id) on update cascade on delete cascade,
  enabled boolean not null default true,
  notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.hive_servers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  enabled boolean not null default true,
  max_players integer not null default 32 check (max_players > 0 and max_players <= 256),
  created_by uuid references public.users(id) on update cascade on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.hive_world_states (
  server_id uuid primary key references public.hive_servers(id) on update cascade on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  world_data jsonb not null default '{}'::jsonb,
  updated_by uuid references public.users(id) on update cascade on delete set null,
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.hive_world_events (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.hive_servers(id) on update cascade on delete cascade,
  revision bigint not null check (revision > 0),
  actor_user_id uuid references public.users(id) on update cascade on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  unique (server_id, revision)
);

create table if not exists public.hive_npcs (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.hive_servers(id) on update cascade on delete cascade,
  name text not null,
  role text not null default 'resident',
  backstory text not null default '',
  system_prompt text not null default '',
  model text not null default 'gemini-2.5-flash-lite',
  position jsonb not null default '{"x":0,"y":1,"z":0}'::jsonb,
  memory_enabled boolean not null default true,
  backstory_enabled boolean not null default true,
  custom_prompt_enabled boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on update cascade on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.hive_npc_memories (
  id uuid primary key default gen_random_uuid(),
  npc_id uuid not null references public.hive_npcs(id) on update cascade on delete cascade,
  server_id uuid not null references public.hive_servers(id) on update cascade on delete cascade,
  content text not null,
  importance integer not null default 1 check (importance between 1 and 5),
  enabled boolean not null default true,
  created_by uuid references public.users(id) on update cascade on delete set null,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.hive_npc_runs (
  id uuid primary key default gen_random_uuid(),
  npc_id uuid not null references public.hive_npcs(id) on update cascade on delete cascade,
  server_id uuid not null references public.hive_servers(id) on update cascade on delete cascade,
  actor_user_id uuid references public.users(id) on update cascade on delete set null,
  input_context jsonb not null default '{}'::jsonb,
  output_decision jsonb not null default '{}'::jsonb,
  applied_event_id uuid references public.hive_world_events(id) on update cascade on delete set null,
  created_at timestamp with time zone not null default now()
);

create index if not exists hive_servers_enabled_idx
on public.hive_servers (enabled, created_at desc);

create index if not exists hive_world_events_server_revision_idx
on public.hive_world_events (server_id, revision desc);

create index if not exists hive_npcs_server_idx
on public.hive_npcs (server_id, created_at desc);

create index if not exists hive_npc_memories_npc_enabled_idx
on public.hive_npc_memories (npc_id, enabled, created_at desc);

create index if not exists hive_npc_runs_npc_created_idx
on public.hive_npc_runs (npc_id, created_at desc);

create or replace function public.is_hive_member(_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.hive_members hm
    where hm.user_id = _user_id
      and hm.enabled = true
  );
$$;

create or replace function public.is_hive_platform_admin(_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_user_roles pur
    where pur.user_id = _user_id
      and pur.enabled = true
      and pur.allow_role_management = true
  );
$$;

create or replace function public.apply_hive_world_event(
  p_server_id uuid,
  p_actor_user_id uuid,
  p_expected_revision bigint,
  p_event_type text,
  p_payload jsonb,
  p_world_data jsonb
)
returns table (
  id uuid,
  server_id uuid,
  revision bigint,
  actor_user_id uuid,
  event_type text,
  payload jsonb,
  created_at timestamp with time zone
)
language plpgsql
security definer
set search_path = public
as $$
declare
  next_revision bigint;
  event_row public.hive_world_events%rowtype;
begin
  if not public.is_hive_member(p_actor_user_id) and not public.is_hive_platform_admin(p_actor_user_id) then
    raise exception 'hive_access_denied' using errcode = '42501';
  end if;

  perform 1
  from public.hive_servers hs
  where hs.id = p_server_id
    and hs.enabled = true;

  if not found then
    raise exception 'hive_server_not_found' using errcode = 'P0002';
  end if;

  insert into public.hive_world_states (server_id, revision, world_data, updated_by)
  values (p_server_id, 0, '{}'::jsonb, p_actor_user_id)
  on conflict (server_id) do nothing;

  update public.hive_world_states hws
  set
    revision = hws.revision + 1,
    world_data = coalesce(p_world_data, hws.world_data),
    updated_by = p_actor_user_id,
    updated_at = now()
  where hws.server_id = p_server_id
    and hws.revision = p_expected_revision
  returning hws.revision into next_revision;

  if next_revision is null then
    raise exception 'hive_revision_conflict' using errcode = '40001';
  end if;

  insert into public.hive_world_events (
    server_id,
    revision,
    actor_user_id,
    event_type,
    payload
  )
  values (
    p_server_id,
    next_revision,
    p_actor_user_id,
    p_event_type,
    coalesce(p_payload, '{}'::jsonb)
  )
  returning * into event_row;

  return query
  select
    event_row.id,
    event_row.server_id,
    event_row.revision,
    event_row.actor_user_id,
    event_row.event_type,
    event_row.payload,
    event_row.created_at;
end;
$$;

alter table public.hive_members enable row level security;
alter table public.hive_servers enable row level security;
alter table public.hive_world_states enable row level security;
alter table public.hive_world_events enable row level security;
alter table public.hive_npcs enable row level security;
alter table public.hive_npc_memories enable row level security;
alter table public.hive_npc_runs enable row level security;

create policy "Hive members can read own membership"
on public.hive_members for select
to authenticated
using (user_id = auth.uid() or public.is_hive_platform_admin());

create policy "Hive admins manage members"
on public.hive_members for all
to authenticated
using (public.is_hive_platform_admin())
with check (public.is_hive_platform_admin());

create policy "Hive members can read enabled servers"
on public.hive_servers for select
to authenticated
using ((enabled and public.is_hive_member()) or public.is_hive_platform_admin());

create policy "Hive admins manage servers"
on public.hive_servers for all
to authenticated
using (public.is_hive_platform_admin())
with check (public.is_hive_platform_admin());

create policy "Hive members can read world states"
on public.hive_world_states for select
to authenticated
using (public.is_hive_member() or public.is_hive_platform_admin());

create policy "Hive members can read world events"
on public.hive_world_events for select
to authenticated
using (public.is_hive_member() or public.is_hive_platform_admin());

create policy "Hive members can read NPCs"
on public.hive_npcs for select
to authenticated
using (public.is_hive_member() or public.is_hive_platform_admin());

create policy "Hive members can read NPC memories"
on public.hive_npc_memories for select
to authenticated
using (public.is_hive_member() or public.is_hive_platform_admin());

create policy "Hive members can read NPC runs"
on public.hive_npc_runs for select
to authenticated
using (public.is_hive_member() or public.is_hive_platform_admin());

grant execute on function public.is_hive_member(uuid) to authenticated, service_role;
grant execute on function public.is_hive_platform_admin(uuid) to authenticated, service_role;
grant execute on function public.apply_hive_world_event(uuid, uuid, bigint, text, jsonb, jsonb) to authenticated, service_role;

insert into public.hive_servers (id, name, slug, description, enabled, max_players)
values (
  '8f7fa5cf-8bb1-446a-9c51-f4222f452f4d',
  'Research Garden',
  'research-garden',
  'Default shared Hive server for voxel simulation and NPC behavior experiments.',
  true,
  32
)
on conflict (slug) do nothing;

insert into public.hive_world_states (server_id, revision, world_data)
values (
  '8f7fa5cf-8bb1-446a-9c51-f4222f452f4d',
  0,
  '{
    "blocks": [
      {"id":"grass-0-0","type":"grass","position":{"x":0,"y":0,"z":0}},
      {"id":"grass-1-0","type":"grass","position":{"x":1,"y":0,"z":0}},
      {"id":"grass-0-1","type":"grass","position":{"x":0,"y":0,"z":1}},
      {"id":"path-1-1","type":"path","position":{"x":1,"y":0,"z":1}},
      {"id":"farm-2-1","type":"farm","position":{"x":2,"y":0,"z":1}},
      {"id":"grass-2-0","type":"grass","position":{"x":2,"y":0,"z":0}}
    ],
    "objects": [
      {"id":"house-1","type":"house","position":{"x":0,"y":1,"z":0},"rotation":0},
      {"id":"tree-1","type":"tree","position":{"x":2,"y":1,"z":0},"rotation":0}
    ]
  }'::jsonb
)
on conflict (server_id) do nothing;
