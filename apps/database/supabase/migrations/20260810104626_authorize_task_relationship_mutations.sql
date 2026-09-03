-- Keep relationship reads unchanged while requiring project-management
-- permission and same-workspace containment for every direct write.

drop policy if exists "Users can create task relationships in their workspaces"
on public.task_relationships;
drop policy if exists "Users can update task relationships in their workspaces"
on public.task_relationships;
drop policy if exists "Users can delete task relationships in their workspaces"
on public.task_relationships;

create policy "Managers can create task relationships"
on public.task_relationships
for insert
to authenticated
with check (
  exists (
    select 1
    from public.tasks source_task
    join public.task_lists source_list on source_list.id = source_task.list_id
    join public.workspace_boards source_board on source_board.id = source_list.board_id
    join public.tasks target_task on target_task.id = task_relationships.target_task_id
    join public.task_lists target_list on target_list.id = target_task.list_id
    join public.workspace_boards target_board on target_board.id = target_list.board_id
    where source_task.id = task_relationships.source_task_id
      and source_board.ws_id = target_board.ws_id
      and public.has_workspace_permission(
        source_board.ws_id,
        (select auth.uid()),
        'manage_projects'
      )
      and public.has_workspace_permission(
        target_board.ws_id,
        (select auth.uid()),
        'manage_projects'
      )
  )
);

create policy "Managers can update task relationships"
on public.task_relationships
for update
to authenticated
using (
  exists (
    select 1
    from public.tasks source_task
    join public.task_lists source_list on source_list.id = source_task.list_id
    join public.workspace_boards source_board on source_board.id = source_list.board_id
    join public.tasks target_task on target_task.id = task_relationships.target_task_id
    join public.task_lists target_list on target_list.id = target_task.list_id
    join public.workspace_boards target_board on target_board.id = target_list.board_id
    where source_task.id = task_relationships.source_task_id
      and source_board.ws_id = target_board.ws_id
      and public.has_workspace_permission(
        source_board.ws_id,
        (select auth.uid()),
        'manage_projects'
      )
      and public.has_workspace_permission(
        target_board.ws_id,
        (select auth.uid()),
        'manage_projects'
      )
  )
)
with check (
  exists (
    select 1
    from public.tasks source_task
    join public.task_lists source_list on source_list.id = source_task.list_id
    join public.workspace_boards source_board on source_board.id = source_list.board_id
    join public.tasks target_task on target_task.id = task_relationships.target_task_id
    join public.task_lists target_list on target_list.id = target_task.list_id
    join public.workspace_boards target_board on target_board.id = target_list.board_id
    where source_task.id = task_relationships.source_task_id
      and source_board.ws_id = target_board.ws_id
      and public.has_workspace_permission(
        source_board.ws_id,
        (select auth.uid()),
        'manage_projects'
      )
      and public.has_workspace_permission(
        target_board.ws_id,
        (select auth.uid()),
        'manage_projects'
      )
  )
);

create policy "Managers can delete task relationships"
on public.task_relationships
for delete
to authenticated
using (
  exists (
    select 1
    from public.tasks source_task
    join public.task_lists source_list on source_list.id = source_task.list_id
    join public.workspace_boards source_board on source_board.id = source_list.board_id
    join public.tasks target_task on target_task.id = task_relationships.target_task_id
    join public.task_lists target_list on target_list.id = target_task.list_id
    join public.workspace_boards target_board on target_board.id = target_list.board_id
    where source_task.id = task_relationships.source_task_id
      and source_board.ws_id = target_board.ws_id
      and public.has_workspace_permission(
        source_board.ws_id,
        (select auth.uid()),
        'manage_projects'
      )
      and public.has_workspace_permission(
        target_board.ws_id,
        (select auth.uid()),
        'manage_projects'
      )
  )
);
