-- Scope list-less tasks to their creator.
--
-- tasks.list_id became nullable for personal calendar scheduling tasks
-- (20250624145741). Those rows have no list, board or workspace link; the
-- only owner is creator_id. The tasks policy from 20250727170000 admitted
-- every signed-in user when list_id is null, for reads and writes alike.
--
-- Keep the list branch unchanged (task_lists visibility, which now requires
-- workspace membership) and require creator_id = auth.uid() for list-less
-- rows, on both USING and WITH CHECK so a client cannot create or detach a
-- list-less task on another user's behalf.

alter policy "Enable all access for tasks in accessible task list"
  on public.tasks
  using (
    (list_id is null and creator_id = (select auth.uid()))
    or exists (select 1 from public.task_lists tl where tl.id = tasks.list_id)
  )
  with check (
    (list_id is null and creator_id = (select auth.uid()))
    or exists (select 1 from public.task_lists tl where tl.id = tasks.list_id)
  );
