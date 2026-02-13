-- Create enum for board/list personal override status
create type public.user_scope_override_status as enum (
  'not_started',
  'in_progress',
  'done',
  'closed'
);

-- =============================================================================
-- Table: task_user_overrides
-- Per-user override layer for task properties (priority, due date, estimation).
-- Follows the same composite-PK pattern as task_user_scheduling_settings.
-- =============================================================================
create table if not exists public.task_user_overrides (
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,

  self_managed boolean not null default false,
  completed_at timestamptz null,
  priority_override public.task_priority null,
  due_date_override timestamptz null,
  estimation_override smallint null check (estimation_override is null or (estimation_override >= 0 and estimation_override <= 8)),
  personally_unassigned boolean not null default false,
  notes text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (task_id, user_id)
);

-- Indexes
create index if not exists idx_task_user_overrides_user_id
  on public.task_user_overrides (user_id);

create index if not exists idx_task_user_overrides_user_completed
  on public.task_user_overrides (user_id, completed_at)
  where completed_at is not null;

create index if not exists idx_task_user_overrides_user_unassigned
  on public.task_user_overrides (user_id, personally_unassigned)
  where personally_unassigned = true;

-- Updated-at trigger
drop trigger if exists trg_task_user_overrides_updated_at
  on public.task_user_overrides;

create trigger trg_task_user_overrides_updated_at
before update on public.task_user_overrides
for each row
execute function public.update_updated_at_column();

-- RLS
alter table public.task_user_overrides enable row level security;

drop policy if exists "select_own_task_user_overrides"
  on public.task_user_overrides;
create policy "select_own_task_user_overrides"
  on public.task_user_overrides
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "insert_own_task_user_overrides"
  on public.task_user_overrides;
create policy "insert_own_task_user_overrides"
  on public.task_user_overrides
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "update_own_task_user_overrides"
  on public.task_user_overrides;
create policy "update_own_task_user_overrides"
  on public.task_user_overrides
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "delete_own_task_user_overrides"
  on public.task_user_overrides;
create policy "delete_own_task_user_overrides"
  on public.task_user_overrides
  for delete
  to authenticated
  using (user_id = auth.uid());

-- =============================================================================
-- Table: user_board_list_overrides
-- Per-user personal status for boards or lists (hides tasks from My Tasks).
-- =============================================================================
create table if not exists public.user_board_list_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  scope_type text not null check (scope_type in ('board', 'list')),
  board_id uuid null references public.workspace_boards (id) on delete cascade,
  list_id uuid null references public.task_lists (id) on delete cascade,
  personal_status public.user_scope_override_status not null default 'not_started',
  notes text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- board_id XOR list_id based on scope_type
  constraint chk_scope_board check (scope_type != 'board' or (board_id is not null and list_id is null)),
  constraint chk_scope_list check (scope_type != 'list' or (list_id is not null and board_id is null))
);

-- Unique partial indexes for one override per user per board/list
create unique index if not exists idx_user_board_overrides_unique
  on public.user_board_list_overrides (user_id, board_id)
  where scope_type = 'board';

create unique index if not exists idx_user_list_overrides_unique
  on public.user_board_list_overrides (user_id, list_id)
  where scope_type = 'list';

-- General lookup index
create index if not exists idx_user_board_list_overrides_user_id
  on public.user_board_list_overrides (user_id);

-- Updated-at trigger
drop trigger if exists trg_user_board_list_overrides_updated_at
  on public.user_board_list_overrides;

create trigger trg_user_board_list_overrides_updated_at
before update on public.user_board_list_overrides
for each row
execute function public.update_updated_at_column();

-- RLS
alter table public.user_board_list_overrides enable row level security;

drop policy if exists "select_own_user_board_list_overrides"
  on public.user_board_list_overrides;
create policy "select_own_user_board_list_overrides"
  on public.user_board_list_overrides
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "insert_own_user_board_list_overrides"
  on public.user_board_list_overrides;
create policy "insert_own_user_board_list_overrides"
  on public.user_board_list_overrides
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "update_own_user_board_list_overrides"
  on public.user_board_list_overrides;
create policy "update_own_user_board_list_overrides"
  on public.user_board_list_overrides
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "delete_own_user_board_list_overrides"
  on public.user_board_list_overrides;
create policy "delete_own_user_board_list_overrides"
  on public.user_board_list_overrides
  for delete
  to authenticated
  using (user_id = auth.uid());
