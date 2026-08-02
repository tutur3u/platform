create or replace function private.external_chat_import_event(
  p_ws_id uuid,
  p_connector_key text,
  p_remote_agent_id text,
  p_remote_visitor_id text,
  p_remote_message_id text,
  p_direction text,
  p_content text,
  p_occurred_at timestamptz,
  p_configuration_revision bigint,
  p_thread_metadata jsonb default '{}'::jsonb,
  p_message_metadata jsonb default '{}'::jsonb,
  p_mapped_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_thread private.external_chat_threads%rowtype;
  v_delivery private.external_chat_outbound_deliveries%rowtype;
  v_conversation_id uuid;
  v_conversation_created boolean := false;
  v_message_id uuid;
  v_existing_message_id uuid;
  v_existing_thread_id uuid;
  v_title text;
begin
  if p_connector_key is null or btrim(p_connector_key) = ''
    or p_remote_visitor_id is null or btrim(p_remote_visitor_id) = ''
    or p_remote_message_id is null or btrim(p_remote_message_id) = '' then
    raise exception 'external_chat_invalid_identity';
  end if;

  if p_direction is null or p_direction not in ('visitor', 'staff', 'system') then
    raise exception 'external_chat_invalid_direction';
  end if;

  if char_length(coalesce(p_content, '')) > 10000
    or octet_length(coalesce(p_content, '')) > 40000 then
    raise exception 'external_chat_content_too_large';
  end if;

  if jsonb_typeof(coalesce(p_thread_metadata, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_message_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'external_chat_invalid_metadata';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_ws_id::text, 0));
  if not exists (
    select 1
    from public.workspace_external_project_bindings b
    join private.external_chat_binding_credentials c on c.ws_id = b.ws_id
    where b.ws_id = p_ws_id
      and b.is_enabled = true
      and b.settings #>> '{chat,enabled}' = 'true'
      and coalesce(b.settings #>> '{chat,authorityMode}', 'legacy_primary')
        not in ('fallback_queue', 'paused')
      and c.verified_at is not null
      and c.verified_revision = c.configuration_revision
      and c.configuration_revision = p_configuration_revision
  ) then
    raise exception 'external_chat_binding_unavailable';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', p_ws_id, p_connector_key, p_remote_message_id),
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', p_ws_id, p_connector_key, coalesce(p_remote_agent_id, ''), p_remote_visitor_id),
    0
  ));

  select e.message_id, e.thread_id
  into v_existing_message_id, v_existing_thread_id
  from private.external_chat_events e
  where e.ws_id = p_ws_id
    and e.connector_key = p_connector_key
    and e.remote_message_id = p_remote_message_id;

  if v_existing_message_id is not null then
    select * into v_thread
    from private.external_chat_threads t
    where t.id = v_existing_thread_id;

    return jsonb_build_object(
      'conversation', private.chat_conversation_json(v_thread.conversation_id, p_mapped_user_id),
      'conversationCreated', false,
      'conversationId', v_thread.conversation_id,
      'duplicate', true,
      'message', (select private.chat_message_json(m) from private.chat_messages m where m.id = v_existing_message_id),
      'messageId', v_existing_message_id,
      'threadId', v_existing_thread_id
    );
  end if;

  select * into v_thread
  from private.external_chat_threads t
  where t.ws_id = p_ws_id
    and t.connector_key = p_connector_key
    and t.remote_agent_id = coalesce(p_remote_agent_id, '')
    and t.remote_visitor_id = p_remote_visitor_id;

  if v_thread.id is null then
    v_title := left(nullif(p_thread_metadata->>'displayName', ''), 255);
    insert into private.chat_conversations (
      ws_id, type, title, metadata, created_at, updated_at
    ) values (
      p_ws_id,
      'channel',
      coalesce(v_title, 'External visitor'),
      coalesce(p_thread_metadata, '{}'::jsonb) || jsonb_build_object('externalChat', true),
      coalesce(p_occurred_at, now()),
      coalesce(p_occurred_at, now())
    ) returning id into v_conversation_id;
    v_conversation_created := true;

    insert into private.external_chat_threads (
      ws_id, connector_key, remote_agent_id, remote_visitor_id,
      conversation_id, metadata
    ) values (
      p_ws_id, p_connector_key, coalesce(p_remote_agent_id, ''),
      p_remote_visitor_id, v_conversation_id, coalesce(p_thread_metadata, '{}'::jsonb)
    ) returning * into v_thread;
  else
    update private.external_chat_threads
    set metadata = metadata || coalesce(p_thread_metadata, '{}'::jsonb)
    where id = v_thread.id;
  end if;

  if p_direction = 'staff' then
    select * into v_delivery
    from private.external_chat_outbound_deliveries d
    where d.ws_id = p_ws_id
      and d.thread_id = v_thread.id
      and d.idempotency_key::text = p_remote_message_id
    for update;
  end if;

  update private.chat_conversations
  set archived_at = null,
      updated_at = greatest(updated_at, coalesce(p_occurred_at, now()))
  where id = v_thread.conversation_id;

  if p_mapped_user_id is not null and exists (
    select 1 from public.workspace_members wm
    where wm.ws_id = p_ws_id and wm.user_id = p_mapped_user_id
  ) then
    insert into private.chat_conversation_members (
      conversation_id, user_id, role, metadata
    ) values (
      v_thread.conversation_id, p_mapped_user_id, 'member',
      jsonb_build_object('externalRouting', true)
    )
    on conflict (conversation_id, user_id) do update
    set archived_at = null,
        metadata = private.chat_conversation_members.metadata || excluded.metadata;
  end if;

  insert into private.chat_messages (
    conversation_id, sender_id, kind, content, reply_to_message_id, metadata, created_at
  ) values (
    v_thread.conversation_id,
    case
      when v_delivery.id is not null then v_delivery.actor_user_id
      when p_direction = 'staff' and exists (
        select 1 from public.workspace_members wm
        where wm.ws_id = p_ws_id and wm.user_id = p_mapped_user_id
      ) then p_mapped_user_id
    end,
    case when p_direction = 'system' then 'system' else 'user' end,
    coalesce(p_content, ''),
    v_delivery.reply_to_message_id,
    coalesce(p_message_metadata, '{}'::jsonb) || jsonb_build_object(
      'externalChat', true,
      'externalSender',
        coalesce(p_message_metadata->'externalSender', '{}'::jsonb)
          || jsonb_build_object('direction', p_direction),
      'remoteMessageId', p_remote_message_id,
      'nativeOrigin', v_delivery.id is not null
    ),
    coalesce(p_occurred_at, now())
  ) returning id into v_message_id;

  insert into private.external_chat_events (
    ws_id, thread_id, connector_key, remote_message_id, message_id,
    direction, metadata, created_at
  ) values (
    p_ws_id, v_thread.id, p_connector_key, p_remote_message_id,
    v_message_id, p_direction, coalesce(p_message_metadata, '{}'::jsonb),
    coalesce(p_occurred_at, now())
  );

  if v_delivery.id is not null then
    update private.external_chat_outbound_deliveries
    set message_id = v_message_id,
        completed_at = now()
    where id = v_delivery.id;
  end if;

  return jsonb_build_object(
    'conversation', private.chat_conversation_json(v_thread.conversation_id, p_mapped_user_id),
    'conversationCreated', v_conversation_created,
    'conversationId', v_thread.conversation_id,
    'duplicate', false,
    'message', (select private.chat_message_json(m) from private.chat_messages m where m.id = v_message_id),
    'messageId', v_message_id,
    'threadId', v_thread.id
  );
end;
$$;

revoke all on function private.external_chat_import_event(
  uuid, text, text, text, text, text, text, timestamptz, bigint, jsonb, jsonb, uuid
) from public, anon, authenticated;
grant execute on function private.external_chat_import_event(
  uuid, text, text, text, text, text, text, timestamptz, bigint, jsonb, jsonb, uuid
) to service_role;

create or replace function private.chat_persist_ai_message_batch(
  p_ws_id uuid,
  p_conversation_id uuid,
  p_actor_user_id uuid,
  p_messages jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_conversation private.chat_conversations%rowtype;
  v_item jsonb;
  v_message_id uuid;
  v_messages jsonb := '[]'::jsonb;
begin
  perform private.chat_assert_workspace_permission(
    p_ws_id,
    p_actor_user_id,
    'view_chat'
  );

  select * into v_conversation
  from private.chat_conversations
  where id = p_conversation_id
    and archived_at is null
    and type = 'ai'
    and private.chat_can_address_conversation_workspace(
      p_ws_id,
      ws_id,
      type,
      p_actor_user_id
    )
  for update;

  if v_conversation.id is null then return null; end if;
  if not private.chat_actor_can_access_conversation(
    p_conversation_id,
    p_actor_user_id
  ) then
    raise exception 'chat_conversation_forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(p_messages) <> 'array'
    or jsonb_array_length(p_messages) = 0
    or jsonb_array_length(p_messages) > 20 then
    raise exception 'chat_invalid_ai_message_batch' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_messages) loop
    if jsonb_typeof(v_item) <> 'object'
      or length(btrim(coalesce(v_item->>'content', ''))) = 0
      or length(v_item->>'content') > 10000
      or jsonb_typeof(coalesce(v_item->'metadata', '{}'::jsonb)) <> 'object' then
      raise exception 'chat_invalid_ai_message_batch' using errcode = '22023';
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_messages) loop
    insert into private.chat_messages (
      conversation_id, sender_id, kind, content, metadata
    ) values (
      p_conversation_id,
      null,
      'assistant',
      v_item->>'content',
      coalesce(v_item->'metadata', '{}'::jsonb)
    ) returning id into v_message_id;

    v_messages := v_messages || jsonb_build_array(
      (select private.chat_message_json(m)
       from private.chat_messages m where m.id = v_message_id)
    );
  end loop;

  update private.chat_conversations
  set updated_at = now()
  where id = p_conversation_id;

  update private.chat_conversation_members
  set last_read_at = now(), last_seen_message_id = v_message_id
  where conversation_id = p_conversation_id and user_id = p_actor_user_id;

  insert into private.chat_audit_events (
    ws_id, conversation_id, actor_id, event_type, metadata
  ) values (
    v_conversation.ws_id,
    p_conversation_id,
    p_actor_user_id,
    'message.sent',
    jsonb_build_object(
      'messageIds', (select jsonb_agg(value->>'id') from jsonb_array_elements(v_messages)),
      'kind', 'assistant',
      'assistantSource', 'native-ai'
    )
  );

  return v_messages;
end;
$$;

revoke all on function private.chat_persist_ai_message_batch(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function private.chat_persist_ai_message_batch(uuid, uuid, uuid, jsonb)
  to service_role;
