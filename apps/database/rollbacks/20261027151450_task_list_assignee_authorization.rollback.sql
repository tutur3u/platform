-- SR-337 / SR-338 rollback: restore the prior catalog policies, ACLs and publication.
begin;
drop policy "Task lists visible to members and board sharees" on public.task_lists;
drop policy "Task lists insertable by board editors" on public.task_lists;
drop policy "Task lists updatable by board editors" on public.task_lists;
drop policy "Task lists deletable by board editors" on public.task_lists;
create policy "Enable all access for members of the task board" on public.task_lists
to authenticated
using (public.is_task_board_member((select auth.uid()), board_id))
with check (public.is_task_board_member((select auth.uid()), board_id));
alter policy "Enable insert for users who can access the task" on public.task_assignees
with check (public.is_task_accessible(task_id));
alter policy "Enable delete for users who can access the task" on public.task_assignees
using (public.is_task_accessible(task_id));
alter policy "Enable select for assignees who has access to the task" on public.task_assignees
using (public.is_task_accessible(task_id));
drop function public.can_edit_task_assignees(uuid);
drop function public.can_access_task_list_board(uuid, boolean);
-- allow-anon-grant: Restore the exact pre-migration ACLs only during an authorized rollback.
grant select, insert, update, delete, truncate, references, trigger on table public.task_lists, public.task_assignees to anon, authenticated;
alter publication supabase_realtime add table public.task_lists;
commit;
