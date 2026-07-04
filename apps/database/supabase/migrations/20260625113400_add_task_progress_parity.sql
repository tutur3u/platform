-- TrackBear-style task progress foundation.
-- Adds flexible metrics, progress entries, goals, leaderboards/teams, and
-- private workspace profile settings for task management.

create table if not exists public.task_progress_metrics (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  unit_label text not null check (char_length(trim(unit_label)) between 1 and 40),
  unit_kind text not null default 'custom' check (
    unit_kind in (
      'tasks',
      'points',
      'minutes',
      'focus_sessions',
      'words',
      'pages',
      'chapters',
      'scenes',
      'lines',
      'custom'
    )
  ),
  description text null check (description is null or char_length(description) <= 1000),
  aggregation text not null default 'sum' check (aggregation in ('sum', 'latest_total')),
  is_default boolean not null default false,
  created_by uuid null references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null
);

create unique index if not exists task_progress_metrics_name_unique_idx
  on public.task_progress_metrics (ws_id, lower(trim(name)))
  where archived_at is null;

create index if not exists task_progress_metrics_ws_idx
  on public.task_progress_metrics (ws_id, is_default desc, created_at asc)
  where archived_at is null;

create table if not exists public.task_progress_entries (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  metric_id uuid not null references public.task_progress_metrics(id) on delete restrict,
  task_id uuid null references public.tasks(id) on delete set null,
  project_id uuid null references public.task_projects(id) on delete set null,
  board_id uuid null references public.workspace_boards(id) on delete set null,
  list_id uuid null references public.task_lists(id) on delete set null,
  entry_date date not null default current_date,
  value numeric(14, 2) not null check (value <> 0),
  mode text not null default 'delta' check (mode in ('delta', 'total')),
  note text null check (note is null or char_length(note) <= 5000),
  tags text[] not null default array[]::text[],
  source_type text not null default 'manual' check (
    source_type in ('manual', 'import', 'task_completion', 'time_tracking', 'api')
  ),
  source_id text null check (source_id is null or char_length(source_id) <= 200),
  created_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  constraint task_progress_entries_tags_count check (cardinality(tags) <= 20)
);

create index if not exists task_progress_entries_ws_date_idx
  on public.task_progress_entries (ws_id, entry_date desc, created_at desc)
  where deleted_at is null;

create index if not exists task_progress_entries_metric_date_idx
  on public.task_progress_entries (metric_id, entry_date desc)
  where deleted_at is null;

create index if not exists task_progress_entries_task_idx
  on public.task_progress_entries (task_id)
  where task_id is not null and deleted_at is null;

create index if not exists task_progress_entries_project_idx
  on public.task_progress_entries (project_id)
  where project_id is not null and deleted_at is null;

create index if not exists task_progress_entries_board_idx
  on public.task_progress_entries (board_id)
  where board_id is not null and deleted_at is null;

create table if not exists public.task_progress_goals (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null references public.users(id) on delete cascade,
  metric_id uuid not null references public.task_progress_metrics(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text null check (description is null or char_length(description) <= 2000),
  goal_type text not null default 'target' check (goal_type in ('target', 'habit')),
  target_value numeric(14, 2) not null check (target_value > 0),
  period_start date not null,
  period_end date null,
  recurrence text not null default 'none' check (
    recurrence in ('none', 'daily', 'weekly', 'monthly')
  ),
  task_id uuid null references public.tasks(id) on delete set null,
  project_id uuid null references public.task_projects(id) on delete set null,
  board_id uuid null references public.workspace_boards(id) on delete set null,
  tags text[] not null default array[]::text[],
  status text not null default 'active' check (
    status in ('active', 'paused', 'completed', 'archived')
  ),
  starred boolean not null default false,
  visibility text not null default 'private' check (visibility in ('private', 'workspace')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  constraint task_progress_goals_period_order check (
    period_end is null or period_end >= period_start
  ),
  constraint task_progress_goals_tags_count check (cardinality(tags) <= 20)
);

create index if not exists task_progress_goals_ws_status_idx
  on public.task_progress_goals (ws_id, status, period_start desc);

create index if not exists task_progress_goals_owner_idx
  on public.task_progress_goals (owner_id, status, period_start desc);

create table if not exists public.task_leaderboards (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  metric_id uuid not null references public.task_progress_metrics(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text null check (description is null or char_length(description) <= 2000),
  period_start date not null,
  period_end date null,
  join_code text not null default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  status text not null default 'active' check (status in ('active', 'archived')),
  starred boolean not null default false,
  visibility text not null default 'workspace' check (visibility in ('workspace')),
  created_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  constraint task_leaderboards_period_order check (
    period_end is null or period_end >= period_start
  )
);

create unique index if not exists task_leaderboards_join_code_unique_idx
  on public.task_leaderboards (join_code);

create index if not exists task_leaderboards_ws_status_idx
  on public.task_leaderboards (ws_id, status, period_start desc);

create table if not exists public.task_leaderboard_teams (
  id uuid primary key default gen_random_uuid(),
  leaderboard_id uuid not null references public.task_leaderboards(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  color text null check (color is null or char_length(color) <= 40),
  created_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists task_leaderboard_teams_name_unique_idx
  on public.task_leaderboard_teams (leaderboard_id, lower(trim(name)));

create table if not exists public.task_leaderboard_members (
  id uuid primary key default gen_random_uuid(),
  leaderboard_id uuid not null references public.task_leaderboards(id) on delete cascade,
  team_id uuid null references public.task_leaderboard_teams(id) on delete set null,
  user_id uuid not null references public.users(id) on delete cascade,
  display_name text null check (display_name is null or char_length(display_name) <= 120),
  status text not null default 'active' check (status in ('active', 'left')),
  joined_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists task_leaderboard_members_user_unique_idx
  on public.task_leaderboard_members (leaderboard_id, user_id);

create index if not exists task_leaderboard_members_team_idx
  on public.task_leaderboard_members (team_id)
  where team_id is not null;

create table if not exists public.task_profile_progress_settings (
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  display_name text null check (display_name is null or char_length(display_name) <= 120),
  visibility text not null default 'private' check (visibility in ('private', 'workspace')),
  show_progress boolean not null default false,
  show_goals boolean not null default false,
  show_leaderboards boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (ws_id, user_id)
);

create or replace function public.touch_task_progress_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists task_progress_metrics_touch_updated_at on public.task_progress_metrics;
create trigger task_progress_metrics_touch_updated_at
before update on public.task_progress_metrics
for each row execute function public.touch_task_progress_updated_at();

drop trigger if exists task_progress_entries_touch_updated_at on public.task_progress_entries;
create trigger task_progress_entries_touch_updated_at
before update on public.task_progress_entries
for each row execute function public.touch_task_progress_updated_at();

drop trigger if exists task_progress_goals_touch_updated_at on public.task_progress_goals;
create trigger task_progress_goals_touch_updated_at
before update on public.task_progress_goals
for each row execute function public.touch_task_progress_updated_at();

drop trigger if exists task_leaderboards_touch_updated_at on public.task_leaderboards;
create trigger task_leaderboards_touch_updated_at
before update on public.task_leaderboards
for each row execute function public.touch_task_progress_updated_at();

drop trigger if exists task_leaderboard_teams_touch_updated_at on public.task_leaderboard_teams;
create trigger task_leaderboard_teams_touch_updated_at
before update on public.task_leaderboard_teams
for each row execute function public.touch_task_progress_updated_at();

drop trigger if exists task_leaderboard_members_touch_updated_at on public.task_leaderboard_members;
create trigger task_leaderboard_members_touch_updated_at
before update on public.task_leaderboard_members
for each row execute function public.touch_task_progress_updated_at();

drop trigger if exists task_profile_progress_settings_touch_updated_at on public.task_profile_progress_settings;
create trigger task_profile_progress_settings_touch_updated_at
before update on public.task_profile_progress_settings
for each row execute function public.touch_task_progress_updated_at();

create or replace function public.is_task_progress_workspace_member(
  p_ws_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.ws_id = p_ws_id
      and wm.user_id = p_user_id
      and wm.type = 'MEMBER'
  );
$$;

alter table public.task_progress_metrics enable row level security;
alter table public.task_progress_entries enable row level security;
alter table public.task_progress_goals enable row level security;
alter table public.task_leaderboards enable row level security;
alter table public.task_leaderboard_teams enable row level security;
alter table public.task_leaderboard_members enable row level security;
alter table public.task_profile_progress_settings enable row level security;

drop policy if exists "task_progress_metrics_member_select" on public.task_progress_metrics;
create policy "task_progress_metrics_member_select"
  on public.task_progress_metrics
  for select
  to authenticated
  using (public.is_task_progress_workspace_member(ws_id));

drop policy if exists "task_progress_metrics_member_write" on public.task_progress_metrics;
create policy "task_progress_metrics_member_write"
  on public.task_progress_metrics
  for all
  to authenticated
  using (public.is_task_progress_workspace_member(ws_id))
  with check (public.is_task_progress_workspace_member(ws_id));

drop policy if exists "task_progress_entries_member_select" on public.task_progress_entries;
create policy "task_progress_entries_member_select"
  on public.task_progress_entries
  for select
  to authenticated
  using (public.is_task_progress_workspace_member(ws_id));

drop policy if exists "task_progress_entries_member_write" on public.task_progress_entries;
create policy "task_progress_entries_member_write"
  on public.task_progress_entries
  for all
  to authenticated
  using (public.is_task_progress_workspace_member(ws_id))
  with check (
    public.is_task_progress_workspace_member(ws_id)
    and created_by = auth.uid()
  );

drop policy if exists "task_progress_goals_member_select" on public.task_progress_goals;
create policy "task_progress_goals_member_select"
  on public.task_progress_goals
  for select
  to authenticated
  using (public.is_task_progress_workspace_member(ws_id));

drop policy if exists "task_progress_goals_member_write" on public.task_progress_goals;
create policy "task_progress_goals_member_write"
  on public.task_progress_goals
  for all
  to authenticated
  using (public.is_task_progress_workspace_member(ws_id))
  with check (
    public.is_task_progress_workspace_member(ws_id)
    and owner_id = auth.uid()
  );

drop policy if exists "task_leaderboards_member_select" on public.task_leaderboards;
create policy "task_leaderboards_member_select"
  on public.task_leaderboards
  for select
  to authenticated
  using (public.is_task_progress_workspace_member(ws_id));

drop policy if exists "task_leaderboards_member_write" on public.task_leaderboards;
create policy "task_leaderboards_member_write"
  on public.task_leaderboards
  for all
  to authenticated
  using (public.is_task_progress_workspace_member(ws_id))
  with check (
    public.is_task_progress_workspace_member(ws_id)
    and created_by = auth.uid()
  );

drop policy if exists "task_leaderboard_teams_member_select" on public.task_leaderboard_teams;
create policy "task_leaderboard_teams_member_select"
  on public.task_leaderboard_teams
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.task_leaderboards leaderboard
      where leaderboard.id = leaderboard_id
        and public.is_task_progress_workspace_member(leaderboard.ws_id)
    )
  );

drop policy if exists "task_leaderboard_teams_member_write" on public.task_leaderboard_teams;
create policy "task_leaderboard_teams_member_write"
  on public.task_leaderboard_teams
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.task_leaderboards leaderboard
      where leaderboard.id = leaderboard_id
        and public.is_task_progress_workspace_member(leaderboard.ws_id)
    )
  )
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.task_leaderboards leaderboard
      where leaderboard.id = leaderboard_id
        and public.is_task_progress_workspace_member(leaderboard.ws_id)
    )
  );

drop policy if exists "task_leaderboard_members_member_select" on public.task_leaderboard_members;
create policy "task_leaderboard_members_member_select"
  on public.task_leaderboard_members
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.task_leaderboards leaderboard
      where leaderboard.id = leaderboard_id
        and public.is_task_progress_workspace_member(leaderboard.ws_id)
    )
  );

drop policy if exists "task_leaderboard_members_member_write" on public.task_leaderboard_members;
create policy "task_leaderboard_members_member_write"
  on public.task_leaderboard_members
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.task_leaderboards leaderboard
      where leaderboard.id = leaderboard_id
        and public.is_task_progress_workspace_member(leaderboard.ws_id)
    )
  )
  with check (
    joined_by = auth.uid()
    and exists (
      select 1
      from public.task_leaderboards leaderboard
      where leaderboard.id = leaderboard_id
        and public.is_task_progress_workspace_member(leaderboard.ws_id)
    )
  );

drop policy if exists "task_profile_progress_settings_member_select" on public.task_profile_progress_settings;
create policy "task_profile_progress_settings_member_select"
  on public.task_profile_progress_settings
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or (
      show_progress = true
      and visibility = 'workspace'
      and public.is_task_progress_workspace_member(ws_id)
    )
  );

drop policy if exists "task_profile_progress_settings_owner_write" on public.task_profile_progress_settings;
create policy "task_profile_progress_settings_owner_write"
  on public.task_profile_progress_settings
  for all
  to authenticated
  using (
    user_id = auth.uid()
    and public.is_task_progress_workspace_member(ws_id)
  )
  with check (
    user_id = auth.uid()
    and public.is_task_progress_workspace_member(ws_id)
  );

grant select, insert, update, delete on table public.task_progress_metrics to authenticated;
grant select, insert, update, delete on table public.task_progress_entries to authenticated;
grant select, insert, update, delete on table public.task_progress_goals to authenticated;
grant select, insert, update, delete on table public.task_leaderboards to authenticated;
grant select, insert, update, delete on table public.task_leaderboard_teams to authenticated;
grant select, insert, update, delete on table public.task_leaderboard_members to authenticated;
grant select, insert, update, delete on table public.task_profile_progress_settings to authenticated;

grant all privileges on table public.task_progress_metrics to service_role;
grant all privileges on table public.task_progress_entries to service_role;
grant all privileges on table public.task_progress_goals to service_role;
grant all privileges on table public.task_leaderboards to service_role;
grant all privileges on table public.task_leaderboard_teams to service_role;
grant all privileges on table public.task_leaderboard_members to service_role;
grant all privileges on table public.task_profile_progress_settings to service_role;

grant execute on function public.touch_task_progress_updated_at() to service_role;
grant execute on function public.is_task_progress_workspace_member(uuid, uuid) to authenticated, service_role;

insert into public.task_progress_metrics (
  ws_id,
  name,
  unit_label,
  unit_kind,
  description,
  is_default,
  created_by
)
select
  workspace.id,
  seed.name,
  seed.unit_label,
  seed.unit_kind,
  seed.description,
  seed.is_default,
  null
from public.workspaces workspace
cross join (
  values
    ('Completed tasks', 'tasks', 'tasks', 'Completed task count', true),
    ('Estimate points', 'points', 'points', 'Completed or logged estimation points', false),
    ('Focus time', 'minutes', 'minutes', 'Minutes spent on focused task work', false),
    ('Words', 'words', 'words', 'Writing-style word progress', false),
    ('Pages', 'pages', 'pages', 'Writing-style page progress', false),
    ('Chapters', 'chapters', 'chapters', 'Writing-style chapter progress', false),
    ('Scenes', 'scenes', 'scenes', 'Writing-style scene progress', false),
    ('Lines', 'lines', 'lines', 'Writing-style line progress', false)
) as seed(name, unit_label, unit_kind, description, is_default)
on conflict do nothing;
