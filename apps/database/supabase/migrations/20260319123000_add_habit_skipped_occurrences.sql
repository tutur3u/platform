create table if not exists public.habit_skipped_occurrences (
  id uuid primary key default extensions.gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  habit_id uuid not null references public.workspace_habits(id) on delete cascade,
  occurrence_date date not null,
  created_by uuid null references auth.users(id) on delete set null,
  source_event_id uuid null references public.workspace_calendar_events(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  revoked_at timestamptz null,
  unique (ws_id, habit_id, occurrence_date)
);

create index if not exists idx_habit_skipped_occurrences_ws_habit_date
  on public.habit_skipped_occurrences (ws_id, habit_id, occurrence_date);

create index if not exists idx_habit_skipped_occurrences_active
  on public.habit_skipped_occurrences (ws_id, occurrence_date)
  where revoked_at is null;

alter table public.habit_skipped_occurrences enable row level security;

create policy "Users can view skipped habit occurrences in their workspaces"
  on public.habit_skipped_occurrences
  for select
  using (
    ws_id in (
      select ws_id
      from public.workspace_members
      where user_id = auth.uid()
    )
  );

create policy "Users can manage skipped habit occurrences in their workspaces"
  on public.habit_skipped_occurrences
  for all
  using (
    ws_id in (
      select ws_id
      from public.workspace_members
      where user_id = auth.uid()
    )
  )
  with check (
    ws_id in (
      select ws_id
      from public.workspace_members
      where user_id = auth.uid()
    )
  );

drop trigger if exists habit_skipped_occurrences_updated_at
  on public.habit_skipped_occurrences;

create trigger habit_skipped_occurrences_updated_at
  before update on public.habit_skipped_occurrences
  for each row
  execute function public.update_updated_at_column();

comment on table public.habit_skipped_occurrences is
  'Stores per-occurrence habit skips so skipped days do not get auto-rescheduled until explicitly revoked.';
comment on column public.habit_skipped_occurrences.revoked_at is
  'When set, the skip is no longer active but remains in history for audit/debugging purposes.';
