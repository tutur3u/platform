create or replace function private.chat_send_message(
  p_ws_id uuid,
  p_conversation_id uuid,
  p_actor_user_id uuid,
  p_content text,
  p_reply_to_message_id uuid default null,
  p_attachments jsonb default '[]'::jsonb,
  p_kind text default 'user'
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_conversation private.chat_conversations%rowtype;
  v_message_id uuid;
  v_attachment jsonb;
  v_storage_path text;
  v_storage_ws_id uuid;
  v_expected_storage_ws_id uuid;
  v_full_path text;
  v_size_bytes bigint;
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
    return null;
  end if;

  if not private.chat_actor_can_access_conversation(
    p_conversation_id,
    p_actor_user_id
  ) then
    raise exception 'chat_conversation_forbidden'
      using errcode = '42501';
  end if;

  if v_conversation.type = 'channel' then
    insert into private.chat_conversation_members (
      conversation_id,
      user_id,
      role,
      last_read_at
    )
    values (p_conversation_id, p_actor_user_id, 'member', now())
    on conflict (conversation_id, user_id) do update
    set archived_at = null;
  end if;

  if p_kind not in ('user', 'assistant', 'system') then
    raise exception 'chat_invalid_message_kind'
      using errcode = '22023';
  end if;

  if p_kind <> 'user' and not public.has_workspace_permission(
    p_ws_id,
    p_actor_user_id,
    'manage_chat'
  ) then
    raise exception 'chat_manage_permission_required'
      using errcode = '42501';
  end if;

  if p_reply_to_message_id is not null and not exists (
    select 1
    from private.chat_messages
    where id = p_reply_to_message_id
      and conversation_id = p_conversation_id
      and deleted_at is null
  ) then
    raise exception 'chat_reply_target_not_found'
      using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_content, ''))) = 0
    and jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) = 0 then
    raise exception 'chat_message_empty'
      using errcode = '22023';
  end if;

  v_expected_storage_ws_id := private.chat_attachment_storage_workspace_id(
    p_ws_id,
    v_conversation.type,
    p_actor_user_id
  );

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
    case when p_kind = 'assistant' then null else p_actor_user_id end,
    p_kind,
    left(coalesce(p_content, ''), 10000),
    p_reply_to_message_id,
    '{}'::jsonb
  )
  returning id into v_message_id;

  for v_attachment in
    select value
    from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb))
  loop
    v_storage_path := v_attachment->>'path';
    v_full_path := v_attachment->>'fullPath';
    v_size_bytes := nullif(v_attachment->>'sizeBytes', '')::bigint;
    v_storage_ws_id := coalesce(
      nullif(v_attachment->>'storageWsId', '')::uuid,
      v_expected_storage_ws_id
    );

    if v_storage_ws_id <> v_expected_storage_ws_id then
      raise exception 'chat_attachment_storage_workspace_forbidden'
        using errcode = '42501';
    end if;

    if v_storage_path is null or not starts_with(
      v_storage_path,
      format('chats/%s/', p_conversation_id)
    ) then
      raise exception 'chat_attachment_path_forbidden'
        using errcode = '42501';
    end if;

    if v_full_path is not null and not starts_with(
      v_full_path,
      format('%s/chats/%s/', v_expected_storage_ws_id, p_conversation_id)
    ) then
      raise exception 'chat_attachment_full_path_forbidden'
        using errcode = '42501';
    end if;

    insert into private.chat_message_attachments (
      conversation_id,
      message_id,
      uploader_id,
      storage_ws_id,
      storage_path,
      full_path,
      filename,
      content_type,
      size_bytes,
      metadata
    )
    values (
      p_conversation_id,
      v_message_id,
      p_actor_user_id,
      v_storage_ws_id,
      v_storage_path,
      v_full_path,
      coalesce(nullif(v_attachment->>'filename', ''), 'attachment'),
      nullif(v_attachment->>'contentType', ''),
      v_size_bytes,
      coalesce(v_attachment->'metadata', '{}'::jsonb)
    );
  end loop;

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
    p_ws_id,
    p_conversation_id,
    p_actor_user_id,
    'message.sent',
    jsonb_build_object(
      'messageId',
      v_message_id,
      'kind',
      p_kind,
      'attachmentCount',
      jsonb_array_length(coalesce(p_attachments, '[]'::jsonb))
    )
  );

  return (
    select private.chat_message_json(m)
    from private.chat_messages m
    where m.id = v_message_id
  );
end;
$$;

revoke all on function private.chat_send_message(uuid, uuid, uuid, text, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function private.chat_send_message(uuid, uuid, uuid, text, uuid, jsonb, text) to service_role;
