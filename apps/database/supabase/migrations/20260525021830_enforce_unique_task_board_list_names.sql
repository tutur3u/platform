-- Preserve existing task boards and task lists while enforcing user-facing
-- name uniqueness. Names compare case-insensitively after trimming.

with duplicate_boards as (
  select
    id,
    row_number() over (
      partition by ws_id, lower(btrim(name))
      order by created_at desc nulls last, id desc
    ) as duplicate_rank
  from public.workspace_boards
  where deleted_at is null
)
update public.workspace_boards as board
set name = left(btrim(coalesce(board.name, '')), 206)
  || ' (duplicate '
  || board.id::text
  || ')'
from duplicate_boards
where duplicate_boards.id = board.id
  and duplicate_boards.duplicate_rank > 1;

with duplicate_lists as (
  select
    id,
    row_number() over (
      partition by board_id, lower(btrim(name))
      order by created_at desc nulls last, id desc
    ) as duplicate_rank
  from public.task_lists
  where deleted = false
)
update public.task_lists as list
set name = left(btrim(coalesce(list.name, '')), 206)
  || ' (duplicate '
  || list.id::text
  || ')'
from duplicate_lists
where duplicate_lists.id = list.id
  and duplicate_lists.duplicate_rank > 1;

create unique index if not exists idx_workspace_boards_unique_workspace_normalized_name
on public.workspace_boards (ws_id, lower(btrim(name)))
where deleted_at is null;

create unique index if not exists idx_task_lists_unique_board_normalized_name
on public.task_lists (board_id, lower(btrim(name)))
where deleted = false;
