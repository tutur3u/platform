create or replace function private.chat_update_conversation(
  p_ws_id uuid,
  p_conversation_id uuid,
  p_actor_user_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_conversation private.chat_conversations%rowtype;
  v_has_title boolean := p_input ? 'title';
  v_has_description boolean := p_input ? 'description';
  v_title text := nullif(btrim(coalesce(p_input->>'title', '')), '');
  v_description text := nullif(btrim(coalesce(p_input->>'description', '')), '');
begin
  perform private.chat_assert_workspace_permission(
    p_ws_id,
    p_actor_user_id,
    'view_chat'
  );

  select *
  into v_conversation
  from private.chat_conversations
  where id = p_conversation_id
    and archived_at is null
    and (
      ws_id = p_ws_id
      or (
        type in ('direct', 'group')
        and private.chat_is_actor_personal_workspace(p_ws_id, p_actor_user_id)
      )
    );

  if v_conversation.id is null then
    raise exception 'chat_conversation_not_found'
      using errcode = 'P0002';
  end if;

  if not private.chat_actor_can_access_conversation(
    p_conversation_id,
    p_actor_user_id
  ) then
    raise exception 'chat_conversation_forbidden'
      using errcode = '42501';
  end if;

  if v_conversation.type in ('channel', 'ai') and not public.has_workspace_permission(
    p_ws_id,
    p_actor_user_id,
    'manage_chat'
  ) then
    raise exception 'chat_manage_permission_required'
      using errcode = '42501';
  end if;

  if v_has_title
    and v_conversation.type in ('group', 'channel')
    and v_title is null
  then
    raise exception 'chat_title_required'
      using errcode = '22023';
  end if;

  update private.chat_conversations
  set
    title = case when v_has_title then v_title else title end,
    description = case
      when v_has_description then v_description
      else description
    end
  where id = p_conversation_id;

  insert into private.chat_audit_events (
    ws_id,
    conversation_id,
    actor_id,
    event_type,
    metadata
  )
  values (
    p_ws_id,
    p_conversation_id,
    p_actor_user_id,
    'conversation.updated',
    jsonb_build_object(
      'hasTitle',
      v_has_title,
      'hasDescription',
      v_has_description,
      'type',
      v_conversation.type
    )
  );

  return private.chat_conversation_json(p_conversation_id, p_actor_user_id);
end;
$$;

revoke all on function private.chat_update_conversation(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function private.chat_update_conversation(uuid, uuid, uuid, jsonb) to service_role;
