create or replace function private.mind_get_board_graph_snapshot(
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
    )
  );
end;
$$;

create or replace function private.mind_list_ai_patches(
  p_ws_id uuid,
  p_board_id uuid,
  p_limit integer default 20
)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select coalesce(jsonb_agg(private.mind_patch_json(p.id) order by p.created_at desc), '[]'::jsonb)
  from (
    select id, created_at
    from private.mind_ai_patches
    where board_id = p_board_id
      and ws_id = p_ws_id
    order by created_at desc
    limit greatest(0, least(coalesce(p_limit, 20), 100))
  ) p;
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
  graph_json jsonb;
begin
  graph_json := private.mind_get_board_graph_snapshot(p_ws_id, p_board_id);

  if graph_json is null then
    return null;
  end if;

  return graph_json || jsonb_build_object(
    'patches',
    private.mind_list_ai_patches(p_ws_id, p_board_id, 20)
  );
end;
$$;

revoke all on function private.mind_get_board_graph_snapshot(uuid, uuid) from public, anon, authenticated;
revoke all on function private.mind_list_ai_patches(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function private.mind_get_board_snapshot(uuid, uuid) from public, anon, authenticated;

grant execute on function private.mind_get_board_graph_snapshot(uuid, uuid) to service_role;
grant execute on function private.mind_list_ai_patches(uuid, uuid, integer) to service_role;
grant execute on function private.mind_get_board_snapshot(uuid, uuid) to service_role;
