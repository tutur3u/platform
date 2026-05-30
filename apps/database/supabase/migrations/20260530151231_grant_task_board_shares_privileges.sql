-- The task board share API uses Supabase REST with the service role, and
-- authenticated RLS policies still need matching table privileges.
grant select, insert, update, delete on table public.task_board_shares to authenticated;
grant all privileges on table public.task_board_shares to service_role;

grant execute on function public.get_task_board_workspace_id(uuid) to authenticated;
grant execute on function public.get_task_board_workspace_id(uuid) to service_role;
grant execute on function public.is_task_board_workspace_member(uuid) to authenticated;
grant execute on function public.is_task_board_workspace_member(uuid) to service_role;

notify pgrst, 'reload schema';
