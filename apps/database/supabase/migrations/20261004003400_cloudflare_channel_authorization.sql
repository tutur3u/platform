-- Service-only ticket authorization; Supabase remains the relational source of truth.
create or replace function private.cloudflare_channel_role(p_actor uuid, p_topic text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid;
  v_ws uuid;
  v_board uuid;
  v_permission text;
  v_prefix text;
begin
  if p_actor is null or length(p_topic) > 180 then return null; end if;
  if p_topic = 'task-user-realtime-' || p_actor::text then return 'editor'; end if;
  if p_topic ~ '^board-realtime-[0-9a-f-]{36}$' then
    v_id := substring(p_topic from 16)::uuid;
    select id, ws_id into v_board, v_ws from public.workspace_boards where id = v_id and deleted_at is null;
  elsif p_topic ~ '^task-editor-[0-9a-f-]{36}$' then
    v_id := substring(p_topic from 13)::uuid;
    select b.id, b.ws_id into v_board, v_ws
    from public.tasks t join public.task_lists l on l.id = t.list_id
    join public.workspace_boards b on b.id = l.board_id
    where t.id = v_id and t.deleted_at is null and b.deleted_at is null;
  elsif p_topic ~ '^form-studio-[0-9a-f-]{36}$' then
    if private.can_join_form_realtime_topic(p_topic, p_actor) then return 'editor'; end if;
    return null;
  elsif p_topic ~ '^ws-presence-[0-9a-f-]{36}$' then
    v_ws := substring(p_topic from 13)::uuid;
    if exists(select 1 from public.workspace_members where ws_id = v_ws and user_id = p_actor) then return 'editor'; end if;
    return null;
  elsif p_topic ~ '^whiteboard-[0-9a-f-]{36}-[0-9a-f-]{36}-(elements|cursors)$' then
    v_ws := substring(p_topic from 12 for 36)::uuid;
    v_id := substring(p_topic from 49 for 36)::uuid;
    if exists(select 1 from public.workspace_whiteboards w
      join public.workspace_members m on m.ws_id = w.ws_id
      where w.id = v_id and w.ws_id = v_ws and w.archived_at is null and m.user_id = p_actor)
    then return 'editor'; end if;
    return null;
  else return null;
  end if;
  if v_board is null then return null; end if;
  if exists(select 1 from public.workspace_members where ws_id = v_ws and user_id = p_actor and type = 'MEMBER') then
    if public.has_workspace_permission(v_ws, p_actor, 'manage_projects') then return 'editor'; end if;
    v_permission := 'viewer';
  end if;
  if exists(select 1 from public.task_board_shares s where s.board_id = v_board and s.permission = 'edit'
    and (s.shared_with_user_id = p_actor or lower(s.shared_with_email) =
      (select lower(email) from public.user_private_details where user_id = p_actor))) then return 'editor'; end if;
  if v_permission is not null then return v_permission; end if;
  if exists(select 1 from public.task_board_shares s where s.board_id = v_board
    and (s.shared_with_user_id = p_actor or lower(s.shared_with_email) =
      (select lower(email) from public.user_private_details where user_id = p_actor))) then return 'viewer'; end if;
  return null;
exception when invalid_text_representation then return null;
end $$;
revoke all on function private.cloudflare_channel_role(uuid, text) from public, anon, authenticated;
grant execute on function private.cloudflare_channel_role(uuid, text) to service_role;
