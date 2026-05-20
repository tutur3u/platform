create schema if not exists private;

grant usage on schema private to service_role;

alter table private.mind_nodes
  add column if not exists status text not null default 'planned';

alter table private.mind_nodes
  drop constraint if exists mind_nodes_status_check;

alter table private.mind_nodes
  add constraint mind_nodes_status_check check (
    status in (
      'backlog',
      'planned',
      'in_progress',
      'in_review',
      'blocked',
      'completed',
      'deferred',
      'cancelled'
    )
  );

create index if not exists mind_nodes_ws_status_idx
  on private.mind_nodes (ws_id, status)
  where deleted_at is null;

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
        and n.deleted_at is null
    ),
    'edgeCount', (
      select count(*)::int
      from private.mind_edges e
      where e.board_id = b.id
        and e.deleted_at is null
    ),
    'tagCount', (
      select count(*)::int
      from private.mind_tags t
      where t.board_id = b.id
    )
  )
  from private.mind_boards b
  where b.id = p_board_id;
$$;

create or replace function private.mind_patch_json(p_patch_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select jsonb_build_object(
    'id', p.id,
    'threadId', p.thread_id,
    'boardId', p.board_id,
    'createdBy', p.created_by,
    'summary', p.summary,
    'patch', p.patch,
    'status', p.status,
    'appliedAt', p.applied_at::text,
    'createdAt', p.created_at::text
  )
  from private.mind_ai_patches p
  where p.id = p_patch_id;
$$;

create or replace function private.mind_list_boards(p_ws_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select coalesce(
    jsonb_agg(private.mind_board_json(b.id) order by b.updated_at desc, b.created_at desc),
    '[]'::jsonb
  )
  from private.mind_boards b
  where b.ws_id = p_ws_id
    and b.status = 'active';
$$;

create or replace function private.mind_get_board(
  p_ws_id uuid,
  p_board_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select private.mind_board_json(b.id)
  from private.mind_boards b
  where b.id = p_board_id
    and b.ws_id = p_ws_id
  limit 1;
$$;

create or replace function private.mind_create_board(
  p_ws_id uuid,
  p_user_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  created_id uuid;
begin
  insert into private.mind_boards (
    ws_id,
    creator_id,
    title,
    description,
    default_horizon
  )
  values (
    p_ws_id,
    p_user_id,
    p_input->>'title',
    p_input->>'description',
    coalesce(nullif(p_input->>'defaultHorizon', ''), 'year')
  )
  returning id into created_id;

  return private.mind_board_json(created_id);
end;
$$;

create or replace function private.mind_update_board(
  p_ws_id uuid,
  p_board_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  updated_id uuid;
begin
  update private.mind_boards
  set
    title = case when p_input ? 'title' then p_input->>'title' else title end,
    description = case when p_input ? 'description' then p_input->>'description' else description end,
    status = case when p_input ? 'status' then p_input->>'status' else status end,
    default_horizon = case when p_input ? 'defaultHorizon' then p_input->>'defaultHorizon' else default_horizon end,
    canvas_view = case when p_input ? 'canvasView' then p_input->'canvasView' else canvas_view end,
    settings = case when p_input ? 'settings' then coalesce(p_input->'settings', '{}'::jsonb) else settings end
  where id = p_board_id
    and ws_id = p_ws_id
  returning id into updated_id;

  if updated_id is null then
    return null;
  end if;

  return private.mind_board_json(updated_id);
end;
$$;

create or replace function private.mind_node_json(n private.mind_nodes)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select jsonb_build_object(
    'id', n.id,
    'title', n.title,
    'body', n.body,
    'nodeType', n.node_type,
    'horizon', n.horizon,
    'status', n.status,
    'parentNodeId', n.parent_node_id,
    'positionX', n.position_x,
    'positionY', n.position_y,
    'width', n.width,
    'height', n.height,
    'color', n.color,
    'metadata', n.metadata,
    'createdAt', n.created_at::text,
    'updatedAt', n.updated_at::text
  );
$$;

create or replace function private.mind_edge_json(e private.mind_edges)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select jsonb_build_object(
    'id', e.id,
    'sourceNodeId', e.source_node_id,
    'targetNodeId', e.target_node_id,
    'edgeType', e.edge_type,
    'label', e.label,
    'color', e.color,
    'weight', e.weight,
    'metadata', e.metadata,
    'createdAt', e.created_at::text,
    'updatedAt', e.updated_at::text
  );
$$;

create or replace function private.mind_get_board_snapshot(
  p_ws_id uuid,
  p_board_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = private, public, pg_temp
as $$
declare
  board_json jsonb;
begin
  select private.mind_board_json(b.id)
  into board_json
  from private.mind_boards b
  where b.id = p_board_id
    and b.ws_id = p_ws_id
    and b.status = 'active'
  limit 1;

  if board_json is null then
    return null;
  end if;

  return jsonb_build_object(
    'board', board_json,
    'nodes', (
      select coalesce(jsonb_agg(private.mind_node_json(n) order by n.sort_order asc, n.created_at asc), '[]'::jsonb)
      from private.mind_nodes n
      where n.board_id = p_board_id
        and n.ws_id = p_ws_id
        and n.deleted_at is null
    ),
    'edges', (
      select coalesce(jsonb_agg(private.mind_edge_json(e) order by e.created_at asc), '[]'::jsonb)
      from private.mind_edges e
      where e.board_id = p_board_id
        and e.ws_id = p_ws_id
        and e.deleted_at is null
    ),
    'tags', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'name', t.name,
        'color', t.color,
        'createdAt', t.created_at::text,
        'nodeIds', coalesce(nodes.node_ids, '[]'::jsonb)
      ) order by t.name asc), '[]'::jsonb)
      from private.mind_tags t
      left join lateral (
        select jsonb_agg(nt.node_id order by nt.created_at asc) as node_ids
        from private.mind_node_tags nt
        where nt.tag_id = t.id
      ) nodes on true
      where t.board_id = p_board_id
        and t.ws_id = p_ws_id
    ),
    'groups', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', g.id,
        'name', g.name,
        'color', g.color,
        'createdAt', g.created_at::text,
        'nodeIds', coalesce(nodes.node_ids, '[]'::jsonb)
      ) order by g.created_at asc), '[]'::jsonb)
      from private.mind_groups g
      left join lateral (
        select jsonb_agg(gn.node_id order by gn.created_at asc) as node_ids
        from private.mind_group_nodes gn
        where gn.group_id = g.id
      ) nodes on true
      where g.board_id = p_board_id
        and g.ws_id = p_ws_id
    ),
    'links', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id,
        'nodeId', l.node_id,
        'entityType', l.entity_type,
        'entityId', l.entity_id,
        'url', l.url,
        'label', l.label,
        'metadata', l.metadata,
        'createdAt', l.created_at::text
      ) order by l.created_at asc), '[]'::jsonb)
      from private.mind_node_links l
      where l.board_id = p_board_id
        and l.ws_id = p_ws_id
    ),
    'patches', (
      select coalesce(jsonb_agg(private.mind_patch_json(p.id) order by p.created_at desc), '[]'::jsonb)
      from (
        select id, created_at
        from private.mind_ai_patches
        where board_id = p_board_id
          and ws_id = p_ws_id
        order by created_at desc
        limit 20
      ) p
    )
  );
end;
$$;

create or replace function private.mind_search_nodes(
  p_ws_id uuid,
  p_board_id uuid default null,
  p_q text default null
)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select coalesce(jsonb_agg(private.mind_node_json(n) order by n.updated_at desc), '[]'::jsonb)
  from (
    select *
    from private.mind_nodes n
    where n.ws_id = p_ws_id
      and (p_board_id is null or n.board_id = p_board_id)
      and n.deleted_at is null
      and (
        nullif(trim(coalesce(p_q, '')), '') is null
        or n.title ilike ('%' || p_q || '%')
        or n.body ilike ('%' || p_q || '%')
      )
    order by n.updated_at desc
    limit 50
  ) n;
$$;

create or replace function private.mind_save_graph(
  p_ws_id uuid,
  p_board_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  item jsonb;
begin
  perform 1
  from private.mind_boards
  where id = p_board_id
    and ws_id = p_ws_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'Mind board not found';
  end if;

  for item in select value from jsonb_array_elements(coalesce(p_input->'deletedEdgeIds', '[]'::jsonb))
  loop
    update private.mind_edges
    set deleted_at = now()
    where id = (item#>>'{}')::uuid
      and board_id = p_board_id
      and ws_id = p_ws_id;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_input->'deletedNodeIds', '[]'::jsonb))
  loop
    update private.mind_nodes
    set deleted_at = now()
    where id = (item#>>'{}')::uuid
      and board_id = p_board_id
      and ws_id = p_ws_id;

    update private.mind_edges
    set deleted_at = now()
    where board_id = p_board_id
      and ws_id = p_ws_id
      and (
        source_node_id = (item#>>'{}')::uuid
        or target_node_id = (item#>>'{}')::uuid
      );
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_input->'nodes', '[]'::jsonb))
  loop
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
      metadata,
      deleted_at
    )
    values (
      (item->>'id')::uuid,
      p_board_id,
      p_ws_id,
      nullif(item->>'parentNodeId', '')::uuid,
      item->>'title',
      item->>'body',
      coalesce(nullif(item->>'nodeType', ''), 'idea'),
      coalesce(nullif(item->>'horizon', ''), 'year'),
      coalesce(nullif(item->>'status', ''), 'planned'),
      coalesce((item->>'positionX')::double precision, 0),
      coalesce((item->>'positionY')::double precision, 0),
      coalesce((item->>'width')::double precision, 240),
      coalesce((item->>'height')::double precision, 120),
      item->>'color',
      coalesce(item->'metadata', '{}'::jsonb),
      null
    )
    on conflict (id) do update set
      parent_node_id = excluded.parent_node_id,
      title = excluded.title,
      body = excluded.body,
      node_type = excluded.node_type,
      horizon = excluded.horizon,
      status = excluded.status,
      position_x = excluded.position_x,
      position_y = excluded.position_y,
      width = excluded.width,
      height = excluded.height,
      color = excluded.color,
      metadata = excluded.metadata,
      deleted_at = null
    where private.mind_nodes.board_id = excluded.board_id
      and private.mind_nodes.ws_id = excluded.ws_id;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_input->'edges', '[]'::jsonb))
  loop
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
      metadata,
      deleted_at
    )
    values (
      (item->>'id')::uuid,
      p_board_id,
      p_ws_id,
      (item->>'sourceNodeId')::uuid,
      (item->>'targetNodeId')::uuid,
      coalesce(nullif(item->>'edgeType', ''), 'relates_to'),
      item->>'label',
      item->>'color',
      coalesce((item->>'weight')::double precision, 1),
      coalesce(item->'metadata', '{}'::jsonb),
      null
    )
    on conflict (id) do update set
      source_node_id = excluded.source_node_id,
      target_node_id = excluded.target_node_id,
      edge_type = excluded.edge_type,
      label = excluded.label,
      color = excluded.color,
      weight = excluded.weight,
      metadata = excluded.metadata,
      deleted_at = null
    where private.mind_edges.board_id = excluded.board_id
      and private.mind_edges.ws_id = excluded.ws_id;
  end loop;

  return private.mind_get_board_snapshot(p_ws_id, p_board_id);
end;
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
  if p_thread_id is not null then
    update private.mind_ai_threads
    set
      write_mode = p_write_mode,
      model = p_model,
      board_id = coalesce(p_board_id, board_id)
    where id = p_thread_id
      and ws_id = p_ws_id
      and creator_id = p_user_id
    returning id into resolved_id;

    if resolved_id is not null then
      return resolved_id;
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
  select *
  into patch_row
  from private.mind_ai_patches
  where id = p_patch_id
    and ws_id = p_ws_id
  for update;

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
revoke all on function private.mind_patch_json(uuid) from public, anon, authenticated;
revoke all on function private.mind_list_boards(uuid) from public, anon, authenticated;
revoke all on function private.mind_get_board(uuid, uuid) from public, anon, authenticated;
revoke all on function private.mind_create_board(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function private.mind_update_board(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function private.mind_node_json(private.mind_nodes) from public, anon, authenticated;
revoke all on function private.mind_edge_json(private.mind_edges) from public, anon, authenticated;
revoke all on function private.mind_get_board_snapshot(uuid, uuid) from public, anon, authenticated;
revoke all on function private.mind_search_nodes(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.mind_save_graph(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function private.mind_create_ai_patch(uuid, uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function private.mind_ensure_ai_thread(uuid, uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function private.mind_persist_ai_message(uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.mind_apply_ai_patch(uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function private.mind_board_json(uuid) to service_role;
grant execute on function private.mind_patch_json(uuid) to service_role;
grant execute on function private.mind_list_boards(uuid) to service_role;
grant execute on function private.mind_get_board(uuid, uuid) to service_role;
grant execute on function private.mind_create_board(uuid, uuid, jsonb) to service_role;
grant execute on function private.mind_update_board(uuid, uuid, jsonb) to service_role;
grant execute on function private.mind_node_json(private.mind_nodes) to service_role;
grant execute on function private.mind_edge_json(private.mind_edges) to service_role;
grant execute on function private.mind_get_board_snapshot(uuid, uuid) to service_role;
grant execute on function private.mind_search_nodes(uuid, uuid, text) to service_role;
grant execute on function private.mind_save_graph(uuid, uuid, jsonb) to service_role;
grant execute on function private.mind_create_ai_patch(uuid, uuid, uuid, uuid, text, jsonb) to service_role;
grant execute on function private.mind_ensure_ai_thread(uuid, uuid, uuid, uuid, text, text) to service_role;
grant execute on function private.mind_persist_ai_message(uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb) to service_role;
grant execute on function private.mind_apply_ai_patch(uuid, uuid, uuid) to service_role;
