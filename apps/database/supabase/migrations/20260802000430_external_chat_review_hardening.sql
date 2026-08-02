create or replace function private.chat_list_conversations_by_recency(
  p_ws_id uuid,
  p_actor_user_id uuid,
  p_archived text default 'active',
  p_limit integer default 40
)
returns jsonb
language plpgsql
stable
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_archived text := case
    when p_archived in ('active', 'archived', 'all') then p_archived
    else 'active'
  end;
  v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 1101);
begin
  perform private.chat_assert_workspace_permission(
    p_ws_id,
    p_actor_user_id,
    'view_chat'
  );

  return (
    select coalesce(
      jsonb_agg(
        ranked.conversation
        order by ranked.updated_at desc, ranked.id asc
      ),
      '[]'::jsonb
    )
    from (
      select
        c.id,
        c.updated_at,
        private.chat_conversation_json(c.id, p_actor_user_id)
          || jsonb_build_object(
            'archivedAt',
            (coalesce(c.archived_at, own_member.archived_at))::text
          ) as conversation
      from private.chat_conversations c
      left join private.chat_conversation_members own_member
        on own_member.conversation_id = c.id
        and own_member.user_id = p_actor_user_id
      where private.chat_can_address_conversation_workspace(
          p_ws_id,
          c.ws_id,
          c.type,
          p_actor_user_id
        )
        and (
          (
            v_archived in ('active', 'all')
            and c.archived_at is null
            and private.chat_actor_can_access_conversation(
              c.id,
              p_actor_user_id
            )
          )
          or (
            v_archived in ('archived', 'all')
            and c.type in ('direct', 'group')
            and own_member.archived_at is not null
          )
        )
      order by c.updated_at desc, c.id asc
      limit v_limit
    ) ranked
  );
end;
$$;

revoke all on function private.chat_list_conversations_by_recency(
  uuid, uuid, text, integer
) from public, anon, authenticated;
grant execute on function private.chat_list_conversations_by_recency(
  uuid, uuid, text, integer
) to service_role;

create or replace function private.chat_persist_ai_message_batch_idempotent(
  p_ws_id uuid,
  p_conversation_id uuid,
  p_actor_user_id uuid,
  p_request_id uuid,
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

  select coalesce(
    jsonb_agg(
      private.chat_message_json(m)
      order by m.created_at, m.id
    ),
    '[]'::jsonb
  ) into v_messages
  from private.chat_messages m
  where m.conversation_id = p_conversation_id
    and m.deleted_at is null
    and m.kind = 'assistant'
    and m.metadata->>'requestId' = p_request_id::text;

  if jsonb_array_length(v_messages) > 0 then
    return jsonb_build_object('messages', v_messages, 'replayed', true);
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

  v_messages := '[]'::jsonb;
  for v_item in select value from jsonb_array_elements(p_messages) loop
    insert into private.chat_messages (
      conversation_id, sender_id, kind, content, metadata
    ) values (
      p_conversation_id,
      null,
      'assistant',
      v_item->>'content',
      coalesce(v_item->'metadata', '{}'::jsonb)
        || jsonb_build_object('requestId', p_request_id::text)
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
      'messageIds', (
        select jsonb_agg(value->>'id')
        from jsonb_array_elements(v_messages)
      ),
      'kind', 'assistant',
      'assistantSource', 'native-ai'
    )
  );

  return jsonb_build_object('messages', v_messages, 'replayed', false);
end;
$$;

revoke all on function private.chat_persist_ai_message_batch_idempotent(
  uuid, uuid, uuid, uuid, jsonb
) from public, anon, authenticated;
grant execute on function private.chat_persist_ai_message_batch_idempotent(
  uuid, uuid, uuid, uuid, jsonb
) to service_role;
