-- Task progress upgrade: habit-goal mechanics, zero-progress entries, and a
-- full gamification layer (achievements, XP, levels, streak freezes).
-- Additive and rollout-safe. Builds on 20260625113400_add_task_progress_parity.

-- 1. Allow zero-progress entries (TrackBear parity: a logged 0 is distinct from
--    an untracked day). Negative values remain allowed for corrections.
alter table public.task_progress_entries
  drop constraint if exists task_progress_entries_value_check;

-- 2. Habit-goal configuration. Nullable so existing target goals are untouched.
alter table public.task_progress_goals
  add column if not exists habit_frequency text
    check (
      habit_frequency is null
      or habit_frequency in ('per_day', 'per_week', 'per_month')
    ),
  add column if not exists habit_target_count integer
    check (habit_target_count is null or habit_target_count > 0),
  add column if not exists habit_threshold numeric(14, 2)
    check (habit_threshold is null or habit_threshold >= 0);

-- 3. Gamification: achievement catalog (workspace-scoped, system-seeded).
create table if not exists public.task_progress_achievements (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  code text not null check (char_length(trim(code)) between 1 and 60),
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text null check (description is null or char_length(description) <= 500),
  icon text null check (icon is null or char_length(icon) <= 60),
  tier text not null default 'bronze' check (
    tier in ('bronze', 'silver', 'gold', 'platinum')
  ),
  category text not null default 'milestone' check (
    category in ('streak', 'volume', 'consistency', 'milestone', 'social')
  ),
  criteria jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists task_progress_achievements_code_unique_idx
  on public.task_progress_achievements (ws_id, code);

create index if not exists task_progress_achievements_ws_idx
  on public.task_progress_achievements (ws_id, sort_order asc);

-- 3b. Per-user unlocked achievements.
create table if not exists public.task_progress_user_achievements (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  achievement_code text not null,
  unlocked_at timestamptz not null default now(),
  progress numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists task_progress_user_achievements_unique_idx
  on public.task_progress_user_achievements (ws_id, user_id, achievement_code);

create index if not exists task_progress_user_achievements_user_idx
  on public.task_progress_user_achievements (ws_id, user_id, unlocked_at desc);

-- 3c. Per-user XP / level / streak-freeze wallet.
create table if not exists public.task_progress_user_stats (
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  xp bigint not null default 0 check (xp >= 0),
  level integer not null default 1 check (level >= 1),
  streak_freezes integer not null default 0 check (streak_freezes >= 0),
  last_milestone_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (ws_id, user_id)
);

-- Reuse the shared touch trigger fn from the parity migration.
drop trigger if exists task_progress_achievements_touch_updated_at on public.task_progress_achievements;
create trigger task_progress_achievements_touch_updated_at
before update on public.task_progress_achievements
for each row execute function public.touch_task_progress_updated_at();

drop trigger if exists task_progress_user_achievements_touch_updated_at on public.task_progress_user_achievements;
create trigger task_progress_user_achievements_touch_updated_at
before update on public.task_progress_user_achievements
for each row execute function public.touch_task_progress_updated_at();

drop trigger if exists task_progress_user_stats_touch_updated_at on public.task_progress_user_stats;
create trigger task_progress_user_stats_touch_updated_at
before update on public.task_progress_user_stats
for each row execute function public.touch_task_progress_updated_at();

alter table public.task_progress_achievements enable row level security;
alter table public.task_progress_user_achievements enable row level security;
alter table public.task_progress_user_stats enable row level security;

-- Catalog: any workspace member may read; writes happen via service_role only.
drop policy if exists "task_progress_achievements_member_select" on public.task_progress_achievements;
create policy "task_progress_achievements_member_select"
  on public.task_progress_achievements
  for select
  to authenticated
  using (public.is_task_progress_workspace_member(ws_id));

-- Unlocks: members can see workspace unlocks (for social/leaderboards); users
-- write only their own rows.
drop policy if exists "task_progress_user_achievements_member_select" on public.task_progress_user_achievements;
create policy "task_progress_user_achievements_member_select"
  on public.task_progress_user_achievements
  for select
  to authenticated
  using (public.is_task_progress_workspace_member(ws_id));

drop policy if exists "task_progress_user_achievements_owner_write" on public.task_progress_user_achievements;
create policy "task_progress_user_achievements_owner_write"
  on public.task_progress_user_achievements
  for all
  to authenticated
  using (user_id = auth.uid() and public.is_task_progress_workspace_member(ws_id))
  with check (user_id = auth.uid() and public.is_task_progress_workspace_member(ws_id));

drop policy if exists "task_progress_user_stats_member_select" on public.task_progress_user_stats;
create policy "task_progress_user_stats_member_select"
  on public.task_progress_user_stats
  for select
  to authenticated
  using (public.is_task_progress_workspace_member(ws_id));

drop policy if exists "task_progress_user_stats_owner_write" on public.task_progress_user_stats;
create policy "task_progress_user_stats_owner_write"
  on public.task_progress_user_stats
  for all
  to authenticated
  using (user_id = auth.uid() and public.is_task_progress_workspace_member(ws_id))
  with check (user_id = auth.uid() and public.is_task_progress_workspace_member(ws_id));

grant select, insert, update, delete on table public.task_progress_achievements to authenticated;
grant select, insert, update, delete on table public.task_progress_user_achievements to authenticated;
grant select, insert, update, delete on table public.task_progress_user_stats to authenticated;

grant all privileges on table public.task_progress_achievements to service_role;
grant all privileges on table public.task_progress_user_achievements to service_role;
grant all privileges on table public.task_progress_user_stats to service_role;

-- 4. Seed the starter achievement catalog for every existing workspace. New
--    workspaces are seeded on demand by the tasks app (ensureAchievementCatalog).
insert into public.task_progress_achievements (
  ws_id, code, name, description, icon, tier, category, criteria, sort_order
)
select
  workspace.id,
  seed.code,
  seed.name,
  seed.description,
  seed.icon,
  seed.tier,
  seed.category,
  seed.criteria::jsonb,
  seed.sort_order
from public.workspaces workspace
cross join (
  values
    ('first_entry', 'First steps', 'Log your first progress entry.', 'Sparkles', 'bronze', 'milestone', '{"type":"entries","value":1}', 10),
    ('streak_3', 'Warming up', 'Reach a 3-day activity streak.', 'Flame', 'bronze', 'streak', '{"type":"streak","value":3}', 20),
    ('streak_7', 'On a roll', 'Reach a 7-day activity streak.', 'Flame', 'silver', 'streak', '{"type":"streak","value":7}', 30),
    ('streak_30', 'Unstoppable', 'Reach a 30-day activity streak.', 'Flame', 'gold', 'streak', '{"type":"streak","value":30}', 40),
    ('streak_100', 'Centurion', 'Reach a 100-day activity streak.', 'Trophy', 'platinum', 'streak', '{"type":"streak","value":100}', 50),
    ('active_10', 'Habit forming', 'Be active on 10 different days.', 'CalendarCheck', 'bronze', 'consistency', '{"type":"active_days","value":10}', 60),
    ('active_50', 'Dependable', 'Be active on 50 different days.', 'CalendarCheck', 'silver', 'consistency', '{"type":"active_days","value":50}', 70),
    ('goal_complete', 'Goal getter', 'Complete a target goal.', 'Target', 'silver', 'milestone', '{"type":"goal_completed","value":1}', 80),
    ('volume_1k', 'Getting going', 'Accumulate 1,000 units of any metric.', 'TrendingUp', 'bronze', 'volume', '{"type":"total","value":1000}', 90),
    ('volume_10k', 'Prolific', 'Accumulate 10,000 units of any metric.', 'TrendingUp', 'silver', 'volume', '{"type":"total","value":10000}', 100),
    ('volume_50k', 'Powerhouse', 'Accumulate 50,000 units of any metric.', 'Award', 'gold', 'volume', '{"type":"total","value":50000}', 110),
    ('leaderboard_join', 'Team player', 'Join a leaderboard challenge.', 'Users', 'bronze', 'social', '{"type":"leaderboard_joined","value":1}', 120)
) as seed(code, name, description, icon, tier, category, criteria, sort_order)
on conflict (ws_id, code) do nothing;
