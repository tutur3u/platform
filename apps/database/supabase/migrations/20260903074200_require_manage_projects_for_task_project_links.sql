drop policy if exists "Users can manage task project tasks in their workspaces"
on public.task_project_tasks;

create policy "Managers can insert task project links"
on public.task_project_tasks
for insert
to authenticated
with check (
  exists (
    select 1
    from public.task_projects tp
    join public.tasks t
      on t.id = task_project_tasks.task_id
    join public.task_lists tl
      on tl.id = t.list_id
    join public.workspace_boards wb
      on wb.id = tl.board_id
    where tp.id = task_project_tasks.project_id
      and wb.ws_id = tp.ws_id
      and public.has_workspace_permission(
        tp.ws_id,
        (select auth.uid()),
        'manage_projects'
      )
  )
);

create policy "Managers can update task project links"
on public.task_project_tasks
for update
to authenticated
using (
  exists (
    select 1
    from public.task_projects tp
    where tp.id = task_project_tasks.project_id
      and public.has_workspace_permission(
        tp.ws_id,
        (select auth.uid()),
        'manage_projects'
      )
  )
)
with check (
  exists (
    select 1
    from public.task_projects tp
    join public.tasks t
      on t.id = task_project_tasks.task_id
    join public.task_lists tl
      on tl.id = t.list_id
    join public.workspace_boards wb
      on wb.id = tl.board_id
    where tp.id = task_project_tasks.project_id
      and wb.ws_id = tp.ws_id
      and public.has_workspace_permission(
        tp.ws_id,
        (select auth.uid()),
        'manage_projects'
      )
  )
);

create policy "Managers can delete task project links"
on public.task_project_tasks
for delete
to authenticated
using (
  exists (
    select 1
    from public.task_projects tp
    where tp.id = task_project_tasks.project_id
      and public.has_workspace_permission(
        tp.ws_id,
        (select auth.uid()),
        'manage_projects'
      )
  )
);
