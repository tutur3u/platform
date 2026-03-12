create or replace function public.create_task_list_with_next_position(
  p_board_id uuid,
  p_name text,
  p_status public.task_board_status,
  p_color text default null
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
  v_next_position integer;
begin
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
    deleted
  )
  values (
    p_board_id,
    btrim(p_name),
    p_status,
    coalesce(p_color, 'GRAY'),
    v_next_position,
    false
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
  text
) to authenticated;

comment on function public.create_task_list_with_next_position(uuid, text, public.task_board_status, text) is
'Creates a task list at the next board-global position while locking the target board row so concurrent inserts cannot reuse the same position.';

create or replace function public.update_task_with_relations(
  p_task_id uuid,
  p_task_updates jsonb default '{}'::jsonb,
  p_assignee_ids uuid[] default null,
  p_replace_assignees boolean default false,
  p_label_ids uuid[] default null,
  p_replace_labels boolean default false,
  p_project_ids uuid[] default null,
  p_replace_projects boolean default false
)
returns setof public.tasks
language plpgsql
security invoker
set search_path = public
as $$
declare
  updated_task public.tasks%rowtype;
begin
  if p_task_id is null then
    raise exception 'Task ID is required';
  end if;

  if p_task_updates ? 'name'
    and jsonb_typeof(p_task_updates->'name') = 'null' then
    raise exception 'Task name cannot be null';
  end if;

  if p_task_updates ? 'completed'
    and jsonb_typeof(p_task_updates->'completed') = 'null' then
    raise exception 'Task completed cannot be null';
  end if;

  update public.tasks
  set
    name = case
      when p_task_updates ? 'name' then p_task_updates->>'name'
      else tasks.name
    end,
    description = case
      when p_task_updates ? 'description' then p_task_updates->>'description'
      else tasks.description
    end,
    priority = case
      when p_task_updates ? 'priority' then
        case
          when jsonb_typeof(p_task_updates->'priority') = 'null' then null
          else (p_task_updates->>'priority')::public.task_priority
        end
      else tasks.priority
    end,
    start_date = case
      when p_task_updates ? 'start_date' then
        case
          when jsonb_typeof(p_task_updates->'start_date') = 'null' then null
          else (p_task_updates->>'start_date')::timestamptz
        end
      else tasks.start_date
    end,
    end_date = case
      when p_task_updates ? 'end_date' then
        case
          when jsonb_typeof(p_task_updates->'end_date') = 'null' then null
          else (p_task_updates->>'end_date')::timestamptz
        end
      else tasks.end_date
    end,
    completed = case
      when p_task_updates ? 'completed' then
        case
          when jsonb_typeof(p_task_updates->'completed') = 'null' then null
          else (p_task_updates->>'completed')::boolean
        end
      else tasks.completed
    end,
    list_id = case
      when p_task_updates ? 'list_id' then
        case
          when jsonb_typeof(p_task_updates->'list_id') = 'null' then null
          else (p_task_updates->>'list_id')::uuid
        end
      else tasks.list_id
    end,
    estimation_points = case
      when p_task_updates ? 'estimation_points' then
        case
          when jsonb_typeof(p_task_updates->'estimation_points') = 'null' then null
          else (p_task_updates->>'estimation_points')::smallint
        end
      else tasks.estimation_points
    end,
    deleted_at = case
      when p_task_updates ? 'deleted_at' then
        case
          when jsonb_typeof(p_task_updates->'deleted_at') = 'null' then null
          else (p_task_updates->>'deleted_at')::timestamptz
        end
      else tasks.deleted_at
    end
  where tasks.id = p_task_id
  returning tasks.* into updated_task;

  if updated_task is null then
    return;
  end if;

  if p_replace_assignees then
    delete from public.task_assignees
    where task_assignees.task_id = p_task_id;

    if coalesce(array_length(p_assignee_ids, 1), 0) > 0 then
      insert into public.task_assignees (task_id, user_id)
      select p_task_id, assignee_id
      from (
        select distinct unnest(p_assignee_ids) as assignee_id
      ) deduplicated_assignees;
    end if;
  end if;

  if p_replace_labels then
    delete from public.task_labels
    where task_labels.task_id = p_task_id;

    if coalesce(array_length(p_label_ids, 1), 0) > 0 then
      insert into public.task_labels (task_id, label_id)
      select p_task_id, label_id
      from (
        select distinct unnest(p_label_ids) as label_id
      ) deduplicated_labels;
    end if;
  end if;

  if p_replace_projects then
    delete from public.task_project_tasks
    where task_project_tasks.task_id = p_task_id;

    if coalesce(array_length(p_project_ids, 1), 0) > 0 then
      insert into public.task_project_tasks (task_id, project_id)
      select p_task_id, project_id
      from (
        select distinct unnest(p_project_ids) as project_id
      ) deduplicated_projects;
    end if;
  end if;

  return next updated_task;
  return;
end;
$$;

grant execute on function public.update_task_with_relations(
  uuid,
  jsonb,
  uuid[],
  boolean,
  uuid[],
  boolean,
  uuid[],
  boolean
) to authenticated;

comment on function public.update_task_with_relations(uuid, jsonb, uuid[], boolean, uuid[], boolean, uuid[], boolean) is
'Updates a task, returns the touched row when one matched, and optionally replaces assignees, labels, and project links inside one database transaction.';
