-- Read-only audit for 20261029030810_index_task_cycle_tasks_one_cycle_per_task.sql.
-- Counts tasks linked to more than one cycle. The unique index cannot build
-- while any exist; cleanup needs release-authority approval first.
select
  count(*) as tasks_in_multiple_cycles,
  coalesce(sum(link_count - 1), 0) as surplus_links
from (
  select task_id, count(*) as link_count
  from public.task_cycle_tasks
  group by task_id
  having count(*) > 1
) duplicates;
