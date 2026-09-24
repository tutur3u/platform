-- Private, application-authorized research content. No example content or seeds.
create table private.parley_members (
  email text primary key check (email = lower(trim(email)) and position('@' in email) > 1),
  enabled boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table private.parley_scenarios (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 200),
  category text not null check (length(category) between 1 and 80),
  briefing text not null check (length(briefing) <= 12000),
  instructions text not null check (length(instructions) between 1 and 24000),
  roles jsonb not null default '[]'::jsonb check (jsonb_typeof(roles) = 'array'),
  rubric text not null default '' check (length(rubric) <= 12000),
  enabled boolean not null default false,
  revision integer not null default 1,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table private.parley_references (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid references private.parley_scenarios(id) on delete set null,
  filename text not null check (length(filename) between 1 and 255),
  media_type text not null,
  content_base64 text not null check (length(content_base64) <= 14000000),
  extracted_text text not null default '' check (length(extracted_text) <= 200000),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (sha256)
);
create table private.parley_sessions (
  meeting_id uuid primary key references public.workspace_meetings(id) on delete cascade,
  scenario_id uuid not null references private.parley_scenarios(id),
  scenario_revision integer not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table private.parley_observations (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references private.parley_sessions(meeting_id) on delete cascade,
  author_id uuid not null references auth.users(id),
  kind text not null check (kind in ('observation', 'decision', 'debrief')),
  content text not null check (length(content) between 1 and 8000),
  created_at timestamptz not null default now()
);
create index parley_sessions_creator_idx on private.parley_sessions(created_by, created_at desc);
create index parley_observations_meeting_idx on private.parley_observations(meeting_id, created_at);
create index parley_references_scenario_idx on private.parley_references(scenario_id);
alter table private.parley_members enable row level security;
alter table private.parley_scenarios enable row level security;
alter table private.parley_references enable row level security;
alter table private.parley_sessions enable row level security;
alter table private.parley_observations enable row level security;
revoke all on private.parley_members, private.parley_scenarios, private.parley_references, private.parley_sessions, private.parley_observations from public, anon, authenticated;
grant all on private.parley_members, private.parley_scenarios, private.parley_references, private.parley_sessions, private.parley_observations to service_role;

-- Retain the global MFA invariant even though these tables are service-only.
create policy account_required_mfa on private.parley_members as restrictive for all to authenticated
  using ((select public.account_required_mfa_satisfied()))
  with check ((select public.account_required_mfa_satisfied()));
create policy account_required_mfa on private.parley_scenarios as restrictive for all to authenticated
  using ((select public.account_required_mfa_satisfied()))
  with check ((select public.account_required_mfa_satisfied()));
create policy account_required_mfa on private.parley_references as restrictive for all to authenticated
  using ((select public.account_required_mfa_satisfied()))
  with check ((select public.account_required_mfa_satisfied()));
create policy account_required_mfa on private.parley_sessions as restrictive for all to authenticated
  using ((select public.account_required_mfa_satisfied()))
  with check ((select public.account_required_mfa_satisfied()));
create policy account_required_mfa on private.parley_observations as restrictive for all to authenticated
  using ((select public.account_required_mfa_satisfied()))
  with check ((select public.account_required_mfa_satisfied()));

-- Snapshot and meeting creation are atomic; clients cannot substitute private instructions.
create function public.create_parley_session(p_scenario_id uuid, p_user_id uuid, p_ws_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare scenario private.parley_scenarios%rowtype; meeting_id uuid;
begin
  if not exists (select 1 from public.workspaces where id = p_ws_id and creator_id = p_user_id and personal and not coalesce(deleted, false)) then
    raise exception 'Invalid personal workspace';
  end if;
  select * into scenario from private.parley_scenarios where id = p_scenario_id and enabled for share;
  if not found then raise exception 'Scenario unavailable'; end if;
  insert into public.workspace_meetings (name, creator_id, ws_id, time)
    values (scenario.title, p_user_id, p_ws_id, now()) returning id into meeting_id;
  insert into private.parley_sessions (meeting_id, scenario_id, scenario_revision, snapshot, created_by)
    values (meeting_id, scenario.id, scenario.revision, to_jsonb(scenario), p_user_id);
  return meeting_id;
end;
$$;
revoke all on function public.create_parley_session(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_parley_session(uuid, uuid, uuid) to service_role;

create function private.parley_scenario_revision() returns trigger language plpgsql set search_path = '' as $$
begin new.revision := old.revision + 1; new.updated_at := now(); return new; end;
$$;
create trigger parley_scenario_revision before update on private.parley_scenarios
for each row execute function private.parley_scenario_revision();
