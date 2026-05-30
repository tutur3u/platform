create or replace function private.chat_persist_ai_message(
  p_ws_id uuid,
  p_conversation_id uuid,
  p_actor_user_id uuid,
  p_content text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_conversation private.chat_conversations%rowtype;
  v_message_id uuid;
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
    and type = 'ai'
    and private.chat_can_address_conversation_workspace(
      p_ws_id,
      ws_id,
      type,
      p_actor_user_id
    );

  if v_conversation.id is null then
    return null;
  end if;

  if not private.chat_actor_can_access_conversation(
    p_conversation_id,
    p_actor_user_id
  ) then
    raise exception 'chat_conversation_forbidden'
      using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_content, ''))) = 0 then
    raise exception 'chat_message_empty'
      using errcode = '22023';
  end if;

  insert into private.chat_messages (
    conversation_id,
    sender_id,
    kind,
    content,
    reply_to_message_id,
    metadata
  )
  values (
    p_conversation_id,
    null,
    'assistant',
    left(coalesce(p_content, ''), 10000),
    null,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_message_id;

  update private.chat_conversations
  set updated_at = now()
  where id = p_conversation_id;

  update private.chat_conversation_members
  set
    last_read_at = now(),
    last_seen_message_id = v_message_id
  where conversation_id = p_conversation_id
    and user_id = p_actor_user_id;

  insert into private.chat_audit_events (
    ws_id,
    conversation_id,
    actor_id,
    event_type,
    metadata
  )
  values (
    v_conversation.ws_id,
    p_conversation_id,
    p_actor_user_id,
    'message.sent',
    jsonb_build_object(
      'messageId',
      v_message_id,
      'kind',
      'assistant',
      'assistantSource',
      'native-ai'
    )
  );

  return (
    select private.chat_message_json(m)
    from private.chat_messages m
    where m.id = v_message_id
  );
end;
$$;

revoke all on function private.chat_persist_ai_message(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function private.chat_persist_ai_message(uuid, uuid, uuid, text, jsonb) to service_role;
