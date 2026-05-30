-- Task board share writes must stay behind the API route that enforces
-- manage_projects. Authenticated users may read shares through RLS, but direct
-- Supabase REST writes must not be possible with a normal user JWT.
revoke insert, update, delete on table public.task_board_shares from authenticated;

drop policy if exists "Allow workspace members to create task board shares"
on public.task_board_shares;

drop policy if exists "Allow workspace members to update task board shares"
on public.task_board_shares;

drop policy if exists "Allow workspace members to delete task board shares"
on public.task_board_shares;

grant select on table public.task_board_shares to authenticated;
grant all privileges on table public.task_board_shares to service_role;

notify pgrst, 'reload schema';
