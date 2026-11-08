-- SR-337 / SR-338: align direct task-list and assignment access with edit authorization.
-- Keep user-client paths, service-role APIs, and the account MFA fence intact.
create function public.can_access_task_list_board(p_board_id uuid, p_write boolean)
returns boolean
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1 from public.workspace_boards wb
    where wb.id = p_board_id and (
      exists (
        select 1 from public.workspace_members wm
        where wm.ws_id = wb.ws_id and wm.user_id = auth.uid()
          and wm.type = 'MEMBER'::public.workspace_member_type
          and (not p_write or public.has_workspace_permission(wb.ws_id, auth.uid(), 'manage_projects'))
      )
      or (wb.deleted_at is null and exists (
        select 1 from public.task_board_shares s
        where s.board_id = wb.id
          and (not p_write or s.permission = 'edit'::public.task_share_permission)
          and (s.shared_with_user_id = auth.uid() or s.shared_with_email = (
            select lower(trim(u.email)) from auth.users u
            where u.id = auth.uid() and u.email_confirmed_at is not null
          ))
      ))
    )
  );
$$;
revoke all on function public.can_access_task_list_board(uuid, boolean) from public, anon;
grant execute on function public.can_access_task_list_board(uuid, boolean) to authenticated, service_role;

create function public.can_edit_task_assignees(p_task_id uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1 from public.tasks t
    left join public.task_lists tl on tl.id = t.list_id
    where t.id = p_task_id and (
      public.can_access_task_list_board(tl.board_id, true)
      or exists (
        select 1 from public.task_shares s
        where s.task_id = t.id and s.permission = 'edit'::public.task_share_permission
          and (s.shared_with_user_id = auth.uid() or lower(s.shared_with_email) = (
            select lower(trim(u.email)) from auth.users u
            where u.id = auth.uid() and u.email_confirmed_at is not null
          ))
      )
    )
  );
$$;
revoke all on function public.can_edit_task_assignees(uuid) from public, anon;
grant execute on function public.can_edit_task_assignees(uuid) to authenticated, service_role;

-- is_task_board_member remains unchanged for its read callers. The only live
-- write policy using it is replaced by command-specific, member-aware policies.
drop policy "Enable all access for members of the task board" on public.task_lists;
create policy "Task lists visible to members and board sharees" on public.task_lists
for select to authenticated using (public.can_access_task_list_board(board_id, false));
create policy "Task lists insertable by board editors" on public.task_lists
for insert to authenticated with check (public.can_access_task_list_board(board_id, true));
create policy "Task lists updatable by board editors" on public.task_lists
for update to authenticated using (public.can_access_task_list_board(board_id, true))
with check (public.can_access_task_list_board(board_id, true));
create policy "Task lists deletable by board editors" on public.task_lists
for delete to authenticated using (public.can_access_task_list_board(board_id, true));

alter policy "Enable insert for users who can access the task" on public.task_assignees
with check (public.can_edit_task_assignees(task_id));
alter policy "Enable delete for users who can access the task" on public.task_assignees
using (public.can_edit_task_assignees(task_id));
-- DELETE filters also need SELECT visibility for a board editor without a task share.
alter policy "Enable select for assignees who has access to the task" on public.task_assignees
using (public.is_task_accessible(task_id) or public.can_edit_task_assignees(task_id));

revoke all on table public.task_lists, public.task_assignees from anon;
revoke truncate, references, trigger on table public.task_lists, public.task_assignees from authenticated;

alter publication supabase_realtime drop table public.task_lists;
