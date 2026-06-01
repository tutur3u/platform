-- Task board share reads and writes must stay behind server-owned API paths.
-- Those routes enforce manage_projects for share management and use service
-- role/admin clients for guest-access resolution.
revoke all privileges on table public.task_board_shares from public;
revoke all privileges on table public.task_board_shares from anon;
revoke all privileges on table public.task_board_shares from authenticated;
grant all privileges on table public.task_board_shares to service_role;

drop policy if exists "Allow workspace members to view task board shares"
on public.task_board_shares;

drop policy if exists "Allow recipients to view their own task board shares"
on public.task_board_shares;

-- These helpers only supported direct table RLS and should not be callable
-- through authenticated PostgREST RPCs.
revoke all privileges on function public.get_task_board_workspace_id(uuid) from public;
revoke all privileges on function public.get_task_board_workspace_id(uuid) from anon;
revoke all privileges on function public.get_task_board_workspace_id(uuid) from authenticated;
grant execute on function public.get_task_board_workspace_id(uuid) to service_role;

revoke all privileges on function public.is_task_board_workspace_member(uuid) from public;
revoke all privileges on function public.is_task_board_workspace_member(uuid) from anon;
revoke all privileges on function public.is_task_board_workspace_member(uuid) from authenticated;
grant execute on function public.is_task_board_workspace_member(uuid) to service_role;

notify pgrst, 'reload schema';
