-- Add explicit module ordering for education course builder workflows.
alter table public.workspace_course_modules
add column if not exists sort_key integer;

-- Backfill sort_key per course using a deterministic creation order.
with ordered_modules as (
  select
    id,
    row_number() over (
      partition by course_id
      order by created_at asc, id asc
    ) as computed_sort_key
  from public.workspace_course_modules
)
update public.workspace_course_modules m
set sort_key = o.computed_sort_key
from ordered_modules o
where m.id = o.id
  and m.sort_key is null;

create index if not exists idx_workspace_course_modules_course_sort_key
  on public.workspace_course_modules (course_id, sort_key);
