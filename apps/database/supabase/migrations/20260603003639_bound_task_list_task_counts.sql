create or replace function private.get_task_board_list_task_counts(p_board_id uuid)
returns table (
  list_id uuid,
  task_count bigint
)
language sql
stable
security definer
set search_path = public, private
as $$
  select
    task_lists.id as list_id,
    count(tasks.id)::bigint as task_count
  from public.task_lists
  left join public.tasks
    on tasks.list_id = task_lists.id
    and tasks.deleted_at is null
  where task_lists.board_id = p_board_id
    and task_lists.deleted = false
  group by task_lists.id;
$$;

revoke all on function private.get_task_board_list_task_counts(uuid)
  from public, anon, authenticated;
grant execute on function private.get_task_board_list_task_counts(uuid)
  to service_role;

notify pgrst, 'reload schema';
