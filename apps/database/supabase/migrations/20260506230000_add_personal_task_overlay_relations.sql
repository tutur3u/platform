-- Personal-only labels/projects for external tasks shown on personal boards.
-- These relations are intentionally separate from task_labels/task_project_tasks
-- so personal planning metadata never mutates or leaks through source boards.

create table if not exists public.task_user_override_labels (
  task_id uuid not null,
  user_id uuid not null references public.users (id) on delete cascade,
  label_id uuid not null references public.workspace_task_labels (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (task_id, user_id, label_id),
  foreign key (task_id, user_id)
    references public.task_user_overrides (task_id, user_id)
    on delete cascade
);

create table if not exists public.task_user_override_projects (
  task_id uuid not null,
  user_id uuid not null references public.users (id) on delete cascade,
  project_id uuid not null references public.task_projects (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (task_id, user_id, project_id),
  foreign key (task_id, user_id)
    references public.task_user_overrides (task_id, user_id)
    on delete cascade
);

create index if not exists idx_task_user_override_labels_user_task
  on public.task_user_override_labels (user_id, task_id);

create index if not exists idx_task_user_override_labels_label
  on public.task_user_override_labels (label_id);

create index if not exists idx_task_user_override_projects_user_task
  on public.task_user_override_projects (user_id, task_id);

create index if not exists idx_task_user_override_projects_project
  on public.task_user_override_projects (project_id);

alter table public.task_user_override_labels enable row level security;
alter table public.task_user_override_projects enable row level security;

drop policy if exists "select_own_task_user_override_labels"
  on public.task_user_override_labels;
create policy "select_own_task_user_override_labels"
  on public.task_user_override_labels
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "insert_own_task_user_override_labels"
  on public.task_user_override_labels;
create policy "insert_own_task_user_override_labels"
  on public.task_user_override_labels
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.workspace_task_labels wtl
      join public.workspaces ws on ws.id = wtl.ws_id
      where wtl.id = label_id
        and ws.personal = true
        and ws.creator_id = auth.uid()
    )
  );

drop policy if exists "delete_own_task_user_override_labels"
  on public.task_user_override_labels;
create policy "delete_own_task_user_override_labels"
  on public.task_user_override_labels
  for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "select_own_task_user_override_projects"
  on public.task_user_override_projects;
create policy "select_own_task_user_override_projects"
  on public.task_user_override_projects
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "insert_own_task_user_override_projects"
  on public.task_user_override_projects;
create policy "insert_own_task_user_override_projects"
  on public.task_user_override_projects
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.task_projects tp
      join public.workspaces ws on ws.id = tp.ws_id
      where tp.id = project_id
        and ws.personal = true
        and ws.creator_id = auth.uid()
    )
  );

drop policy if exists "delete_own_task_user_override_projects"
  on public.task_user_override_projects;
create policy "delete_own_task_user_override_projects"
  on public.task_user_override_projects
  for delete
  to authenticated
  using (user_id = auth.uid());

grant delete, insert, references, select, trigger, truncate, update
  on table public.task_user_override_labels
  to anon, authenticated, service_role;

grant delete, insert, references, select, trigger, truncate, update
  on table public.task_user_override_projects
  to anon, authenticated, service_role;
