drop function if exists public.create_task_list_with_next_position(
  uuid,
  text,
  public.task_board_status,
  text
);

create or replace function public.create_task_list_with_next_position(
  p_board_id uuid,
  p_name text,
  p_status public.task_board_status,
  p_color text default null,
  p_creator_id uuid default auth.uid()
)
returns table (
  id uuid,
  board_id uuid,
  name text,
  status public.task_board_status,
  color text,
  "position" integer,
  archived boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_next_position integer;
begin
  if auth.uid() is not null
    and p_creator_id is not null
    and p_creator_id is distinct from auth.uid()
  then
    raise exception 'Creator ID does not match authenticated user';
  end if;

  v_actor_id := coalesce(auth.uid(), p_creator_id);

  if v_actor_id is null then
    raise exception 'Creator ID is required';
  end if;

  if p_board_id is null then
    raise exception 'Board ID is required';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'List name is required';
  end if;

  perform 1
  from public.workspace_boards
  where workspace_boards.id = p_board_id
  for update;

  if not found then
    raise exception 'Board not found';
  end if;

  select coalesce(max(task_lists.position), 0) + 1
  into v_next_position
  from public.task_lists
  where task_lists.board_id = p_board_id
    and task_lists.deleted = false;

  return query
  insert into public.task_lists (
    board_id,
    name,
    status,
    color,
    position,
    deleted,
    creator_id
  )
  values (
    p_board_id,
    btrim(p_name),
    p_status,
    coalesce(p_color, 'GRAY'),
    v_next_position,
    false,
    v_actor_id
  )
  returning
    task_lists.id,
    task_lists.board_id,
    task_lists.name,
    task_lists.status,
    task_lists.color,
    task_lists.position as "position",
    task_lists.archived;
end;
$$;

grant execute on function public.create_task_list_with_next_position(
  uuid,
  text,
  public.task_board_status,
  text,
  uuid
) to authenticated, service_role;

comment on function public.create_task_list_with_next_position(
  uuid,
  text,
  public.task_board_status,
  text,
  uuid
) is
'Creates a task list at the next board-global position while locking the target board row so concurrent inserts cannot reuse the same position. Service-role callers must pass the authenticated actor as p_creator_id; authenticated callers cannot forge a different creator.';
