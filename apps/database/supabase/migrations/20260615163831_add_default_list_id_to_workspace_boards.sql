-- Add a per-board default task list for newly created tasks.
-- When set, board-level task creation (create hotkey and board quick-add)
-- defaults new tasks into this list instead of the first list by position.
-- Nullable + additive, so existing behavior is unchanged.
--
-- NOTE: This is intentionally a plain uuid column WITHOUT a foreign key to
-- task_lists. A second FK between workspace_boards and task_lists would make
-- PostgREST resource embedding ambiguous (PGRST201) for the many existing
-- queries that embed task_lists under workspace_boards (and vice versa),
-- breaking them at runtime. Integrity is enforced in the application layer:
-- the board update API validates that the list belongs to the board, and
-- task creation falls back to the first list when the stored id is missing
-- (e.g. the list was later deleted).

alter table public.workspace_boards
  add column if not exists default_list_id uuid;

comment on column public.workspace_boards.default_list_id is
  'Optional task_lists.id used as the default list for new tasks created at the board level. Not an FK (avoids PostgREST embedding ambiguity); validated in the app layer and falls back to the first list when null or the referenced list is missing.';

create index if not exists workspace_boards_default_list_id_idx
  on public.workspace_boards (default_list_id);
