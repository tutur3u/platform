create unique index if not exists mind_boards_id_ws_id_uidx
  on private.mind_boards (id, ws_id);

create unique index if not exists mind_nodes_id_board_ws_id_uidx
  on private.mind_nodes (id, board_id, ws_id);

create unique index if not exists mind_ai_threads_id_ws_id_uidx
  on private.mind_ai_threads (id, ws_id);

alter table private.mind_nodes
  add constraint mind_nodes_board_workspace_fk
  foreign key (board_id, ws_id)
  references private.mind_boards(id, ws_id)
  on delete cascade
  not valid;

alter table private.mind_nodes
  add constraint mind_nodes_parent_board_workspace_fk
  foreign key (parent_node_id, board_id, ws_id)
  references private.mind_nodes(id, board_id, ws_id)
  not valid;

alter table private.mind_nodes
  add constraint mind_nodes_merged_board_workspace_fk
  foreign key (merged_into_node_id, board_id, ws_id)
  references private.mind_nodes(id, board_id, ws_id)
  not valid;

alter table private.mind_edges
  add constraint mind_edges_board_workspace_fk
  foreign key (board_id, ws_id)
  references private.mind_boards(id, ws_id)
  on delete cascade
  not valid;

alter table private.mind_edges
  add constraint mind_edges_source_board_workspace_fk
  foreign key (source_node_id, board_id, ws_id)
  references private.mind_nodes(id, board_id, ws_id)
  not valid;

alter table private.mind_edges
  add constraint mind_edges_target_board_workspace_fk
  foreign key (target_node_id, board_id, ws_id)
  references private.mind_nodes(id, board_id, ws_id)
  not valid;

alter table private.mind_tags
  add constraint mind_tags_board_workspace_fk
  foreign key (board_id, ws_id)
  references private.mind_boards(id, ws_id)
  on delete cascade
  not valid;

alter table private.mind_ai_threads
  add constraint mind_ai_threads_board_workspace_fk
  foreign key (board_id, ws_id)
  references private.mind_boards(id, ws_id)
  on delete cascade
  not valid;

alter table private.mind_ai_messages
  add constraint mind_ai_messages_board_workspace_fk
  foreign key (board_id, ws_id)
  references private.mind_boards(id, ws_id)
  on delete cascade
  not valid;

alter table private.mind_ai_messages
  add constraint mind_ai_messages_thread_workspace_fk
  foreign key (thread_id, ws_id)
  references private.mind_ai_threads(id, ws_id)
  on delete cascade
  not valid;

alter table private.mind_ai_patches
  add constraint mind_ai_patches_board_workspace_fk
  foreign key (board_id, ws_id)
  references private.mind_boards(id, ws_id)
  on delete cascade
  not valid;

alter table private.mind_ai_patches
  add constraint mind_ai_patches_thread_workspace_fk
  foreign key (thread_id, ws_id)
  references private.mind_ai_threads(id, ws_id)
  not valid;

create or replace function private.mind_board_json(p_board_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select jsonb_build_object(
    'id', b.id,
    'wsId', b.ws_id,
    'title', b.title,
    'description', b.description,
    'status', b.status,
    'defaultHorizon', b.default_horizon,
    'canvasView', b.canvas_view,
    'settings', b.settings,
    'createdAt', b.created_at::text,
    'updatedAt', b.updated_at::text,
    'nodeCount', (
      select count(*)::int
      from private.mind_nodes n
      where n.board_id = b.id
        and n.ws_id = b.ws_id
        and n.deleted_at is null
    ),
    'edgeCount', (
      select count(*)::int
      from private.mind_edges e
      where e.board_id = b.id
        and e.ws_id = b.ws_id
        and e.deleted_at is null
    ),
    'tagCount', (
      select count(*)::int
      from private.mind_tags t
      where t.board_id = b.id
        and t.ws_id = b.ws_id
    )
  )
  from private.mind_boards b
  where b.id = p_board_id;
$$;

create or replace function private.mind_create_ai_patch(
  p_ws_id uuid,
  p_board_id uuid,
  p_user_id uuid,
  p_thread_id uuid,
  p_summary text,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  patch_id uuid;
begin
  if not exists (
    select 1
    from private.mind_boards b
    where b.id = p_board_id
      and b.ws_id = p_ws_id
  ) then
    raise exception 'Mind board not found';
  end if;

  if p_thread_id is not null and not exists (
    select 1
    from private.mind_ai_threads t
    where t.id = p_thread_id
      and t.ws_id = p_ws_id
      and t.creator_id = p_user_id
      and (
        t.board_id is null
        or t.board_id = p_board_id
      )
  ) then
    raise exception 'Mind AI thread not found';
  end if;

  insert into private.mind_ai_patches (
    thread_id,
    ws_id,
    board_id,
    created_by,
    summary,
    patch
  )
  values (
    p_thread_id,
    p_ws_id,
    p_board_id,
    p_user_id,
    p_summary,
    p_patch
  )
  returning id into patch_id;

  return private.mind_patch_json(patch_id);
end;
$$;

create or replace function private.mind_ensure_ai_thread(
  p_ws_id uuid,
  p_user_id uuid,
  p_thread_id uuid,
  p_board_id uuid,
  p_write_mode text,
  p_model text
)
returns uuid
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  resolved_id uuid;
begin
  if p_board_id is not null and not exists (
    select 1
    from private.mind_boards b
    where b.id = p_board_id
      and b.ws_id = p_ws_id
  ) then
    raise exception 'Mind board not found';
  end if;

  if p_thread_id is not null then
    update private.mind_ai_threads
    set
      write_mode = p_write_mode,
      model = p_model,
      board_id = coalesce(p_board_id, board_id)
    where id = p_thread_id
      and ws_id = p_ws_id
      and creator_id = p_user_id
      and (
        p_board_id is not null
        or board_id is null
        or exists (
          select 1
          from private.mind_boards b
          where b.id = board_id
            and b.ws_id = p_ws_id
        )
      )
    returning id into resolved_id;

    if resolved_id is not null then
      return resolved_id;
    end if;

    if exists (
      select 1
      from private.mind_ai_threads t
      where t.id = p_thread_id
        and t.ws_id = p_ws_id
        and t.creator_id = p_user_id
    ) then
      raise exception 'Mind AI thread board workspace mismatch';
    end if;
  end if;

  insert into private.mind_ai_threads (
    id,
    ws_id,
    board_id,
    creator_id,
    write_mode,
    model
  )
  values (
    coalesce(p_thread_id, gen_random_uuid()),
    p_ws_id,
    p_board_id,
    p_user_id,
    p_write_mode,
    p_model
  )
  returning id into resolved_id;

  return resolved_id;
end;
$$;

create or replace function private.mind_persist_ai_message(
  p_ws_id uuid,
  p_thread_id uuid,
  p_user_id uuid,
  p_board_id uuid,
  p_role text,
  p_content text,
  p_model text,
  p_tool_calls jsonb,
  p_tool_results jsonb,
  p_usage jsonb,
  p_metadata jsonb
)
returns boolean
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  if p_board_id is not null and not exists (
    select 1
    from private.mind_boards b
    where b.id = p_board_id
      and b.ws_id = p_ws_id
  ) then
    raise exception 'Mind board not found';
  end if;

  if not exists (
    select 1
    from private.mind_ai_threads t
    where t.id = p_thread_id
      and t.ws_id = p_ws_id
      and t.creator_id = p_user_id
      and (
        t.board_id is null
        or exists (
          select 1
          from private.mind_boards b
          where b.id = t.board_id
            and b.ws_id = p_ws_id
        )
      )
      and (
        p_board_id is null
        or t.board_id is null
        or t.board_id = p_board_id
      )
  ) then
    raise exception 'Mind AI thread not found';
  end if;

  insert into private.mind_ai_messages (
    thread_id,
    ws_id,
    board_id,
    creator_id,
    role,
    content,
    model,
    tool_calls,
    tool_results,
    usage,
    metadata
  )
  values (
    p_thread_id,
    p_ws_id,
    p_board_id,
    p_user_id,
    p_role,
    p_content,
    p_model,
    coalesce(p_tool_calls, '[]'::jsonb),
    coalesce(p_tool_results, '[]'::jsonb),
    coalesce(p_usage, '{}'::jsonb),
    coalesce(p_metadata, '{}'::jsonb)
  );

  return true;
end;
$$;

create or replace function private.mind_apply_ai_patch(
  p_ws_id uuid,
  p_patch_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  operation jsonb;
  patch_row private.mind_ai_patches%rowtype;
  node_payload jsonb;
  edge_payload jsonb;
begin
  select p.*
  into patch_row
  from private.mind_ai_patches p
  join private.mind_boards b
    on b.id = p.board_id
   and b.ws_id = p_ws_id
  left join private.mind_ai_threads t
    on t.id = p.thread_id
   and t.ws_id = p_ws_id
  where p.id = p_patch_id
    and p.ws_id = p_ws_id
    and (p.thread_id is null or t.id is not null)
  for update of p;

  if patch_row.id is null then
    raise exception 'Mind patch not found';
  end if;

  if patch_row.status = 'applied' then
    return private.mind_patch_json(patch_row.id);
  end if;

  for operation in
    select value from jsonb_array_elements(coalesce(patch_row.patch->'operations', '[]'::jsonb))
  loop
    if operation->>'kind' = 'create_node' then
      node_payload := operation->'node';
      insert into private.mind_nodes (
        id,
        board_id,
        ws_id,
        parent_node_id,
        title,
        body,
        node_type,
        horizon,
        status,
        position_x,
        position_y,
        width,
        height,
        color,
        metadata
      )
      values (
        (node_payload->>'id')::uuid,
        patch_row.board_id,
        p_ws_id,
        nullif(node_payload->>'parentNodeId', '')::uuid,
        node_payload->>'title',
        node_payload->>'body',
        coalesce(nullif(node_payload->>'nodeType', ''), 'idea'),
        coalesce(nullif(node_payload->>'horizon', ''), 'year'),
        coalesce(nullif(node_payload->>'status', ''), 'planned'),
        coalesce((node_payload->>'positionX')::double precision, 0),
        coalesce((node_payload->>'positionY')::double precision, 0),
        coalesce((node_payload->>'width')::double precision, 240),
        coalesce((node_payload->>'height')::double precision, 120),
        node_payload->>'color',
        coalesce(node_payload->'metadata', '{}'::jsonb)
      )
      on conflict (id) do nothing;
    elsif operation->>'kind' = 'update_node' then
      update private.mind_nodes
      set
        title = case when operation ? 'title' then operation->>'title' else title end,
        body = case when operation ? 'body' then operation->>'body' else body end,
        node_type = case when operation ? 'nodeType' then operation->>'nodeType' else node_type end,
        horizon = case when operation ? 'horizon' then operation->>'horizon' else horizon end,
        status = case when operation ? 'status' then operation->>'status' else status end,
        parent_node_id = case when operation ? 'parentNodeId' then nullif(operation->>'parentNodeId', '')::uuid else parent_node_id end,
        position_x = case when operation ? 'positionX' then (operation->>'positionX')::double precision else position_x end,
        position_y = case when operation ? 'positionY' then (operation->>'positionY')::double precision else position_y end,
        width = case when operation ? 'width' then (operation->>'width')::double precision else width end,
        height = case when operation ? 'height' then (operation->>'height')::double precision else height end,
        color = case when operation ? 'color' then operation->>'color' else color end,
        metadata = case when operation ? 'metadata' then coalesce(operation->'metadata', '{}'::jsonb) else metadata end
      where id = (operation->>'nodeId')::uuid
        and board_id = patch_row.board_id
        and ws_id = p_ws_id;
    elsif operation->>'kind' = 'delete_node' then
      update private.mind_nodes
      set deleted_at = now()
      where id = (operation->>'nodeId')::uuid
        and board_id = patch_row.board_id
        and ws_id = p_ws_id;

      update private.mind_edges
      set deleted_at = now()
      where board_id = patch_row.board_id
        and ws_id = p_ws_id
        and (
          source_node_id = (operation->>'nodeId')::uuid
          or target_node_id = (operation->>'nodeId')::uuid
        );
    elsif operation->>'kind' = 'create_edge' then
      edge_payload := operation->'edge';
      insert into private.mind_edges (
        id,
        board_id,
        ws_id,
        source_node_id,
        target_node_id,
        edge_type,
        label,
        color,
        weight,
        metadata
      )
      values (
        (edge_payload->>'id')::uuid,
        patch_row.board_id,
        p_ws_id,
        (edge_payload->>'sourceNodeId')::uuid,
        (edge_payload->>'targetNodeId')::uuid,
        coalesce(nullif(edge_payload->>'edgeType', ''), 'relates_to'),
        edge_payload->>'label',
        edge_payload->>'color',
        coalesce((edge_payload->>'weight')::double precision, 1),
        coalesce(edge_payload->'metadata', '{}'::jsonb)
      )
      on conflict (id) do nothing;
    elsif operation->>'kind' = 'update_edge' then
      update private.mind_edges
      set
        source_node_id = case when operation ? 'sourceNodeId' then (operation->>'sourceNodeId')::uuid else source_node_id end,
        target_node_id = case when operation ? 'targetNodeId' then (operation->>'targetNodeId')::uuid else target_node_id end,
        edge_type = case when operation ? 'edgeType' then operation->>'edgeType' else edge_type end,
        label = case when operation ? 'label' then operation->>'label' else label end,
        color = case when operation ? 'color' then operation->>'color' else color end,
        weight = case when operation ? 'weight' then (operation->>'weight')::double precision else weight end,
        metadata = case when operation ? 'metadata' then coalesce(operation->'metadata', '{}'::jsonb) else metadata end
      where id = (operation->>'edgeId')::uuid
        and board_id = patch_row.board_id
        and ws_id = p_ws_id;
    elsif operation->>'kind' = 'delete_edge' then
      update private.mind_edges
      set deleted_at = now()
      where id = (operation->>'edgeId')::uuid
        and board_id = patch_row.board_id
        and ws_id = p_ws_id;
    end if;
  end loop;

  update private.mind_ai_patches
  set
    status = 'applied',
    applied_at = now(),
    metadata = jsonb_set(metadata, '{appliedBy}', to_jsonb(p_user_id::text), true)
  where id = p_patch_id
    and ws_id = p_ws_id;

  return private.mind_patch_json(p_patch_id);
end;
$$;

revoke all on function private.mind_board_json(uuid) from public, anon, authenticated;
revoke all on function private.mind_create_ai_patch(uuid, uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function private.mind_ensure_ai_thread(uuid, uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function private.mind_persist_ai_message(uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.mind_apply_ai_patch(uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function private.mind_board_json(uuid) to service_role;
grant execute on function private.mind_create_ai_patch(uuid, uuid, uuid, uuid, text, jsonb) to service_role;
grant execute on function private.mind_ensure_ai_thread(uuid, uuid, uuid, uuid, text, text) to service_role;
grant execute on function private.mind_persist_ai_message(uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb) to service_role;
grant execute on function private.mind_apply_ai_patch(uuid, uuid, uuid) to service_role;

notify pgrst, 'reload schema';
