-- Read-only audit for 20261027090000_guard_task_cycle_task_workspace.sql.
-- Counts existing task_cycle_tasks rows whose task board workspace differs
-- from the cycle workspace (or whose task has no resolvable workspace).
-- The forward migration does not delete or rewrite these rows; any cleanup
-- needs release-authority approval first.
select
  count(*) filter (where wb.ws_id is null) as unresolved_task_workspace,
  count(*) filter (
    where wb.ws_id is not null and wb.ws_id <> tc.ws_id
  ) as cross_workspace_links,
  count(*) as total_links
from public.task_cycle_tasks tct
join public.task_cycles tc on tc.id = tct.cycle_id
left join public.tasks t on t.id = tct.task_id
left join public.task_lists tl on tl.id = t.list_id
left join public.workspace_boards wb on wb.id = tl.board_id;
