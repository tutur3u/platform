-- Scope list-less tasks to their creator without reopening direct table access.
-- The current catalog uses server-owned task APIs and has no permissive task
-- policy for authenticated. Keep that boundary. This restrictive fence also
-- protects older catalogs or future grants with a permissive task policy.
create policy "task_creator_or_accessible_list_guard"
  on public.tasks as restrictive
  for all to authenticated
  using (
    (list_id is null and creator_id = (select auth.uid()))
    or exists (select 1 from public.task_lists tl where tl.id = tasks.list_id)
  )
  with check (
    (list_id is null and creator_id = (select auth.uid()))
    or exists (select 1 from public.task_lists tl where tl.id = tasks.list_id)
  );
