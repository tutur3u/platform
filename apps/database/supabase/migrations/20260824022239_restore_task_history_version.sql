-- Restore a task to the state immediately before a selected history entry.
-- The entire restore is performed in one transaction so core fields and
-- relationships cannot be left partially restored.

create or replace function public.revert_task_to_history(
  p_ws_id uuid,
  p_task_id uuid,
  p_history_id uuid,
  p_fields text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_allowed_fields constant text[] := array[
    'name', 'description', 'priority', 'start_date', 'end_date',
    'estimation_points', 'list_id', 'completed', 'assignees', 'labels',
    'projects'
  ];
  v_snapshot jsonb;
  v_relationships jsonb;
  v_history record;
  v_task public.tasks%rowtype;
  v_identifier text;
  v_completed boolean;
begin
  if coalesce(array_length(p_fields, 1), 0) = 0 then
    raise invalid_parameter_value using
      message = 'At least one field must be selected';
  end if;

  if exists (
    select 1
    from unnest(p_fields) as requested(field_name)
    where not (requested.field_name = any(v_allowed_fields))
  ) then
    raise invalid_parameter_value using
      message = 'Unsupported task field selected';
  end if;

  -- These RPCs enforce workspace membership, task ownership, and history
  -- ownership for the current authenticated actor.
  v_snapshot := public.get_task_snapshot_at_history(
    p_ws_id,
    p_task_id,
    p_history_id
  );
  v_relationships := public.get_task_relationships_at_snapshot(
    p_ws_id,
    p_task_id,
    p_history_id
  );

  select change_type, field_name, old_value, new_value, metadata
  into v_history
  from public.task_history
  where id = p_history_id
    and task_id = p_task_id
    and deleted_at is null;

  if not found then
    raise no_data_found using message = 'History entry not found';
  end if;

  -- Snapshot RPCs reconstruct the state immediately after the selected row.
  -- A version restore targets the state immediately before that row.
  if v_history.change_type = 'field_updated'
    and v_history.field_name = any(v_allowed_fields)
  then
    v_snapshot := jsonb_set(
      v_snapshot,
      array[v_history.field_name],
      coalesce(v_history.old_value, 'null'::jsonb)
    );

    if v_history.field_name = 'list_id'
      and jsonb_typeof(v_history.metadata) = 'object'
      and v_history.metadata ? 'old_list_name'
    then
      v_snapshot := jsonb_set(
        v_snapshot,
        '{list_name}',
        to_jsonb(v_history.metadata->>'old_list_name')
      );
    end if;
  end if;

  -- Apply the selected relationship row itself as a reverse operation. The
  -- relationship snapshot RPC already reverses every later row.
  case v_history.change_type
    when 'assignee_added' then
      v_identifier := coalesce(
        v_history.new_value->>'user_id',
        v_history.new_value->>'id',
        v_history.metadata->>'user_id'
      );
      if v_identifier is not null then
        v_relationships := jsonb_set(
          v_relationships,
          '{assignees}',
          coalesce((
            select jsonb_agg(value)
            from jsonb_array_elements(
              coalesce(v_relationships->'assignees', '[]'::jsonb)
            )
            where coalesce(value->>'user_id', value->>'id') <> v_identifier
          ), '[]'::jsonb)
        );
      end if;
    when 'assignee_removed' then
      v_identifier := coalesce(
        v_history.old_value->>'user_id',
        v_history.old_value->>'id'
      );
      if v_identifier is not null and not exists (
        select 1
        from jsonb_array_elements(
          coalesce(v_relationships->'assignees', '[]'::jsonb)
        )
        where coalesce(value->>'user_id', value->>'id') = v_identifier
      ) then
        v_relationships := jsonb_set(
          v_relationships,
          '{assignees}',
          coalesce(v_relationships->'assignees', '[]'::jsonb)
            || jsonb_build_array(v_history.old_value)
        );
      end if;
    when 'label_added' then
      v_identifier := coalesce(
        v_history.new_value->>'id',
        v_history.metadata->>'label_id'
      );
      if v_identifier is not null then
        v_relationships := jsonb_set(
          v_relationships,
          '{labels}',
          coalesce((
            select jsonb_agg(value)
            from jsonb_array_elements(
              coalesce(v_relationships->'labels', '[]'::jsonb)
            )
            where value->>'id' <> v_identifier
          ), '[]'::jsonb)
        );
      end if;
    when 'label_removed' then
      v_identifier := v_history.old_value->>'id';
      if v_identifier is not null and not exists (
        select 1
        from jsonb_array_elements(
          coalesce(v_relationships->'labels', '[]'::jsonb)
        )
        where value->>'id' = v_identifier
      ) then
        v_relationships := jsonb_set(
          v_relationships,
          '{labels}',
          coalesce(v_relationships->'labels', '[]'::jsonb)
            || jsonb_build_array(v_history.old_value)
        );
      end if;
    when 'project_linked' then
      v_identifier := coalesce(
        v_history.new_value->>'id',
        v_history.new_value->>'project_id',
        v_history.metadata->>'project_id'
      );
      if v_identifier is not null then
        v_relationships := jsonb_set(
          v_relationships,
          '{projects}',
          coalesce((
            select jsonb_agg(value)
            from jsonb_array_elements(
              coalesce(v_relationships->'projects', '[]'::jsonb)
            )
            where value->>'id' <> v_identifier
          ), '[]'::jsonb)
        );
      end if;
    when 'project_unlinked' then
      v_identifier := coalesce(
        v_history.old_value->>'id',
        v_history.old_value->>'project_id'
      );
      if v_identifier is not null and not exists (
        select 1
        from jsonb_array_elements(
          coalesce(v_relationships->'projects', '[]'::jsonb)
        )
        where value->>'id' = v_identifier
      ) then
        v_relationships := jsonb_set(
          v_relationships,
          '{projects}',
          coalesce(v_relationships->'projects', '[]'::jsonb)
            || jsonb_build_array(v_history.old_value)
        );
      end if;
    else
      null;
  end case;

  v_completed := coalesce((v_snapshot->>'completed')::boolean, false);

  if p_fields && array[
    'name', 'description', 'priority', 'start_date', 'end_date',
    'estimation_points', 'list_id', 'completed'
  ] then
    update public.tasks
    set
      name = case when 'name' = any(p_fields)
        then v_snapshot->>'name' else name end,
      description = case when 'description' = any(p_fields) then
        case
          when v_snapshot->'description' is null
            or v_snapshot->'description' = 'null'::jsonb then null
          when jsonb_typeof(v_snapshot->'description') = 'string'
            then v_snapshot->>'description'
          else (v_snapshot->'description')::text
        end
        else description end,
      priority = case when 'priority' = any(p_fields)
        then (v_snapshot->>'priority')::public.task_priority else priority end,
      start_date = case when 'start_date' = any(p_fields)
        then (v_snapshot->>'start_date')::timestamptz else start_date end,
      end_date = case when 'end_date' = any(p_fields)
        then (v_snapshot->>'end_date')::timestamptz else end_date end,
      estimation_points = case when 'estimation_points' = any(p_fields)
        then (v_snapshot->>'estimation_points')::integer else estimation_points end,
      list_id = case when 'list_id' = any(p_fields)
        then (v_snapshot->>'list_id')::uuid else list_id end,
      completed = case when 'completed' = any(p_fields)
        then v_completed else completed end,
      completed_at = case when 'completed' = any(p_fields)
        then case when v_completed then now() else null end else completed_at end
    where id = p_task_id
    returning * into v_task;
  else
    select * into v_task from public.tasks where id = p_task_id;
  end if;

  if not found then
    raise no_data_found using message = 'Task not found';
  end if;

  if 'assignees' = any(p_fields) then
    delete from public.task_assignees where task_id = p_task_id;
    insert into public.task_assignees (task_id, user_id)
    select distinct p_task_id, coalesce(value->>'user_id', value->>'id')::uuid
    from jsonb_array_elements(
      coalesce(v_relationships->'assignees', '[]'::jsonb)
    );
  end if;

  if 'labels' = any(p_fields) then
    delete from public.task_labels where task_id = p_task_id;
    insert into public.task_labels (task_id, label_id)
    select distinct p_task_id, (value->>'id')::uuid
    from jsonb_array_elements(
      coalesce(v_relationships->'labels', '[]'::jsonb)
    );
  end if;

  if 'projects' = any(p_fields) then
    delete from public.task_project_tasks where task_id = p_task_id;
    insert into public.task_project_tasks (task_id, project_id)
    select distinct p_task_id, coalesce(value->>'project_id', value->>'id')::uuid
    from jsonb_array_elements(
      coalesce(v_relationships->'projects', '[]'::jsonb)
    );
  end if;

  return jsonb_build_object(
    'task', to_jsonb(v_task),
    'revertedFields', to_jsonb(p_fields)
  );
end;
$function$;

create or replace function public.revert_task_to_history_for_actor(
  p_actor_user_id uuid,
  p_ws_id uuid,
  p_task_id uuid,
  p_history_id uuid,
  p_fields text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.jwt() ->> 'role' is distinct from 'service_role' then
    raise insufficient_privilege using
      message = 'revert_task_to_history_for_actor requires service role';
  end if;

  if p_actor_user_id is null then
    raise invalid_parameter_value using
      message = 'Task revert actor is required';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', p_actor_user_id::text,
      'role', 'authenticated'
    )::text,
    true
  );

  return public.revert_task_to_history(
    p_ws_id,
    p_task_id,
    p_history_id,
    p_fields
  );
end;
$function$;

revoke all on function public.revert_task_to_history(
  uuid,
  uuid,
  uuid,
  text[]
) from public, anon;
grant execute on function public.revert_task_to_history(
  uuid,
  uuid,
  uuid,
  text[]
) to authenticated;

revoke all on function public.revert_task_to_history_for_actor(
  uuid,
  uuid,
  uuid,
  uuid,
  text[]
) from public, anon, authenticated;
grant execute on function public.revert_task_to_history_for_actor(
  uuid,
  uuid,
  uuid,
  uuid,
  text[]
) to service_role;

comment on function public.revert_task_to_history(
  uuid,
  uuid,
  uuid,
  text[]
) is 'Atomically restores selected task fields to the state immediately before a history entry.';

comment on function public.revert_task_to_history_for_actor(
  uuid,
  uuid,
  uuid,
  uuid,
  text[]
) is 'Service-role-only task history restore wrapper for verified Tuturuuu app-session actors.';
