create table if not exists public.workspace_habit_trackers (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  color text not null default 'BLUE',
  icon text not null default 'repeat',
  tracking_mode text not null default 'event_log',
  target_period text not null default 'daily',
  target_operator text not null default 'gte',
  target_value numeric not null default 1,
  primary_metric_key text not null default 'value',
  aggregation_strategy text not null default 'sum',
  input_schema jsonb not null default '[]'::jsonb,
  quick_add_values jsonb not null default '[]'::jsonb,
  freeze_allowance integer not null default 0,
  recovery_window_periods integer not null default 0,
  start_date date not null default current_date,
  created_by uuid references public.users(id) on delete set null,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_habit_trackers_tracking_mode_check
    check (tracking_mode in ('event_log', 'daily_summary')),
  constraint workspace_habit_trackers_target_period_check
    check (target_period in ('daily', 'weekly')),
  constraint workspace_habit_trackers_target_operator_check
    check (target_operator in ('gte', 'eq')),
  constraint workspace_habit_trackers_aggregation_strategy_check
    check (aggregation_strategy in ('sum', 'max', 'count_entries', 'boolean_any')),
  constraint workspace_habit_trackers_target_value_check
    check (target_value > 0),
  constraint workspace_habit_trackers_input_schema_is_array_check
    check (jsonb_typeof(input_schema) = 'array'),
  constraint workspace_habit_trackers_quick_add_values_is_array_check
    check (jsonb_typeof(quick_add_values) = 'array'),
  constraint workspace_habit_trackers_freeze_allowance_check
    check (freeze_allowance >= 0),
  constraint workspace_habit_trackers_recovery_window_periods_check
    check (recovery_window_periods >= 0)
);

create table if not exists public.workspace_habit_tracker_entries (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  tracker_id uuid not null references public.workspace_habit_trackers(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  entry_kind text not null default 'event_log',
  entry_date date not null default current_date,
  occurred_at timestamptz not null default now(),
  values jsonb not null default '{}'::jsonb,
  primary_value numeric,
  note text,
  tags text[] not null default '{}'::text[],
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_habit_tracker_entries_entry_kind_check
    check (entry_kind in ('event_log', 'daily_summary')),
  constraint workspace_habit_tracker_entries_values_is_object_check
    check (jsonb_typeof(values) = 'object')
);

create table if not exists public.workspace_habit_tracker_streak_actions (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  tracker_id uuid not null references public.workspace_habit_trackers(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  action_type text not null,
  period_start date not null,
  period_end date not null,
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_habit_tracker_streak_actions_action_type_check
    check (action_type in ('freeze', 'repair')),
  constraint workspace_habit_tracker_streak_actions_period_range_check
    check (period_end >= period_start)
);

create index if not exists idx_workspace_habit_trackers_ws_active
  on public.workspace_habit_trackers (ws_id, is_active)
  where archived_at is null;

create index if not exists idx_workspace_habit_trackers_ws_archived
  on public.workspace_habit_trackers (ws_id, archived_at);

create index if not exists idx_workspace_habit_tracker_entries_tracker_user_date
  on public.workspace_habit_tracker_entries (tracker_id, user_id, entry_date desc);

create index if not exists idx_workspace_habit_tracker_entries_ws_date
  on public.workspace_habit_tracker_entries (ws_id, entry_date desc);

create unique index if not exists idx_workspace_habit_tracker_entries_daily_summary_unique
  on public.workspace_habit_tracker_entries (tracker_id, user_id, entry_date)
  where entry_kind = 'daily_summary';

create index if not exists idx_workspace_habit_tracker_streak_actions_tracker_user_period
  on public.workspace_habit_tracker_streak_actions (tracker_id, user_id, period_start desc);

create unique index if not exists idx_workspace_habit_tracker_streak_actions_unique
  on public.workspace_habit_tracker_streak_actions (
    tracker_id,
    user_id,
    action_type,
    period_start
  );

alter table public.workspace_habit_trackers enable row level security;
alter table public.workspace_habit_tracker_entries enable row level security;
alter table public.workspace_habit_tracker_streak_actions enable row level security;

create policy "Users can view habit trackers in their workspaces"
  on public.workspace_habit_trackers
  for select
  using (
    ws_id in (
      select wm.ws_id
      from public.workspace_members wm
      where wm.user_id = auth.uid()
    )
  );

create policy "Users can create habit trackers in their workspaces"
  on public.workspace_habit_trackers
  for insert
  with check (
    ws_id in (
      select wm.ws_id
      from public.workspace_members wm
      where wm.user_id = auth.uid()
    )
  );

create policy "Users can update habit trackers in their workspaces"
  on public.workspace_habit_trackers
  for update
  using (
    ws_id in (
      select wm.ws_id
      from public.workspace_members wm
      where wm.user_id = auth.uid()
    )
  );

create policy "Users can delete habit trackers in their workspaces"
  on public.workspace_habit_trackers
  for delete
  using (
    ws_id in (
      select wm.ws_id
      from public.workspace_members wm
      where wm.user_id = auth.uid()
    )
  );

create policy "Users can view habit tracker entries in their workspaces"
  on public.workspace_habit_tracker_entries
  for select
  using (
    ws_id in (
      select wm.ws_id
      from public.workspace_members wm
      where wm.user_id = auth.uid()
    )
  );

create policy "Users can create habit tracker entries in their workspaces"
  on public.workspace_habit_tracker_entries
  for insert
  with check (
    ws_id in (
      select wm.ws_id
      from public.workspace_members wm
      where wm.user_id = auth.uid()
    )
  );

create policy "Users can update habit tracker entries in their workspaces"
  on public.workspace_habit_tracker_entries
  for update
  using (
    ws_id in (
      select wm.ws_id
      from public.workspace_members wm
      where wm.user_id = auth.uid()
    )
  );

create policy "Users can delete habit tracker entries in their workspaces"
  on public.workspace_habit_tracker_entries
  for delete
  using (
    ws_id in (
      select wm.ws_id
      from public.workspace_members wm
      where wm.user_id = auth.uid()
    )
  );

create policy "Users can view habit tracker streak actions in their workspaces"
  on public.workspace_habit_tracker_streak_actions
  for select
  using (
    ws_id in (
      select wm.ws_id
      from public.workspace_members wm
      where wm.user_id = auth.uid()
    )
  );

create policy "Users can create habit tracker streak actions in their workspaces"
  on public.workspace_habit_tracker_streak_actions
  for insert
  with check (
    ws_id in (
      select wm.ws_id
      from public.workspace_members wm
      where wm.user_id = auth.uid()
    )
  );

create policy "Users can update habit tracker streak actions in their workspaces"
  on public.workspace_habit_tracker_streak_actions
  for update
  using (
    ws_id in (
      select wm.ws_id
      from public.workspace_members wm
      where wm.user_id = auth.uid()
    )
  );

create policy "Users can delete habit tracker streak actions in their workspaces"
  on public.workspace_habit_tracker_streak_actions
  for delete
  using (
    ws_id in (
      select wm.ws_id
      from public.workspace_members wm
      where wm.user_id = auth.uid()
    )
  );

drop trigger if exists workspace_habit_trackers_updated_at
  on public.workspace_habit_trackers;

create trigger workspace_habit_trackers_updated_at
  before update on public.workspace_habit_trackers
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists workspace_habit_tracker_entries_updated_at
  on public.workspace_habit_tracker_entries;

create trigger workspace_habit_tracker_entries_updated_at
  before update on public.workspace_habit_tracker_entries
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists workspace_habit_tracker_streak_actions_updated_at
  on public.workspace_habit_tracker_streak_actions;

create trigger workspace_habit_tracker_streak_actions_updated_at
  before update on public.workspace_habit_tracker_streak_actions
  for each row
  execute function public.update_updated_at_column();

comment on table public.workspace_habit_trackers is
  'Workspace-scoped trackers for recurring habits, metrics, and progress targets.';

comment on table public.workspace_habit_tracker_entries is
  'Per-user habit tracker entries that support event logs and daily summaries.';

comment on table public.workspace_habit_tracker_streak_actions is
  'Explicit freeze and repair actions used by the habit tracker streak engine.';
