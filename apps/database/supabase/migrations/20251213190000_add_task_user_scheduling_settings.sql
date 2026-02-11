-- Adds per-user scheduling settings for tasks.
-- Rationale: multiple collaborators can schedule the same task differently
-- in their own personal workspace calendars (scope / time estimate varies per person).

create table if not exists public.task_user_scheduling_settings (
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,

  total_duration real null,
  is_splittable boolean not null default false,
  min_split_duration_minutes real null,
  max_split_duration_minutes real null,
  calendar_hours public.calendar_hours null,
  auto_schedule boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (task_id, user_id)
);

create index if not exists idx_task_user_scheduling_settings_user_id
  on public.task_user_scheduling_settings (user_id);

-- Keep updated_at current
drop trigger if exists trg_task_user_scheduling_settings_updated_at
  on public.task_user_scheduling_settings;

create trigger trg_task_user_scheduling_settings_updated_at
before update on public.task_user_scheduling_settings
for each row
execute function public.update_updated_at_column();

alter table public.task_user_scheduling_settings enable row level security;

-- Users can manage their own scheduling settings only
drop policy if exists "select_own_task_user_scheduling_settings"
  on public.task_user_scheduling_settings;
create policy "select_own_task_user_scheduling_settings"
  on public.task_user_scheduling_settings
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "insert_own_task_user_scheduling_settings"
  on public.task_user_scheduling_settings;
create policy "insert_own_task_user_scheduling_settings"
  on public.task_user_scheduling_settings
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "update_own_task_user_scheduling_settings"
  on public.task_user_scheduling_settings;
create policy "update_own_task_user_scheduling_settings"
  on public.task_user_scheduling_settings
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "delete_own_task_user_scheduling_settings"
  on public.task_user_scheduling_settings;
create policy "delete_own_task_user_scheduling_settings"
  on public.task_user_scheduling_settings
  for delete
  to authenticated
  using (user_id = auth.uid());

