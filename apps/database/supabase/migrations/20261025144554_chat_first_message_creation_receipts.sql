-- User-approved 2026-10-25 ~20:20 GMT+7. Service-only first-message creation.
-- No conversation FK: this minimal identity survives a conversation deletion and
-- prevents an old creation retry from resurrecting it. Account/workspace erasure cascades.
create table private.chat_creation_requests (
  conversation_id uuid primary key,
  actor_user_id uuid not null references public.users(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  request_id uuid not null,
  conversation_type text not null check (conversation_type = 'ai'),
  initial_settings jsonb not null check (jsonb_typeof(initial_settings) = 'object'),
  created_at timestamptz not null default now(),
  unique (actor_user_id, ws_id, request_id)
);
alter table private.chat_creation_requests enable row level security;
alter table private.chat_creation_requests force row level security;
revoke all on table private.chat_creation_requests from public, anon, authenticated, service_role;
grant select, insert on table private.chat_creation_requests to service_role;

create function private.chat_creation_receipt_json(p_conversation_id uuid)
returns jsonb language sql stable set search_path = pg_catalog, pg_temp as $$
  select jsonb_build_object(
    'id', r.conversation_id, 'wsId', r.ws_id, 'createdBy', r.actor_user_id,
    'type', r.conversation_type, 'createdAt', r.created_at,
    'creationRequestId', r.request_id,
    'initialAiSettings', r.initial_settings || jsonb_build_object(
      'actorUserId', r.actor_user_id, 'wsId', r.ws_id, 'conversationId', r.conversation_id
    )
  ) from private.chat_creation_requests r where r.conversation_id = p_conversation_id
$$;
revoke all on function private.chat_creation_receipt_json(uuid) from public, anon, authenticated;
grant execute on function private.chat_creation_receipt_json(uuid) to service_role;

create or replace function private.chat_create_conversation(
  p_ws_id uuid,
  p_actor_user_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_type text := coalesce(nullif(p_input->>'type', ''), 'channel');
  v_title text := nullif(btrim(coalesce(p_input->>'title', '')), '');
  v_description text := nullif(btrim(coalesce(p_input->>'description', '')), '');
  v_ai_enabled boolean := coalesce((p_input->>'aiEnabled')::boolean, false);
  v_conversation_ws_id uuid := p_ws_id;
  v_participant_ids uuid[] := '{}'::uuid[];
  v_member_ids uuid[] := '{}'::uuid[];
  v_target_user_id uuid;
  v_direct_key text;
  v_conversation_id uuid;
  v_user_id uuid;
  v_initial jsonb := p_input->'initialAiSettings';
  v_credit_ws_id uuid;
  v_billing_ws_id uuid;
  v_client_id uuid;
  v_request_key uuid;
  v_creation private.chat_creation_requests%rowtype;
  v_receipt jsonb;
begin
  if p_input ? 'id' or p_input ? 'creationRequestId' then
    if v_type <> 'ai' or p_input->>'id' is null
      or p_input->>'creationRequestId' is null or v_initial is null then
      raise exception 'chat_invalid_creation_identity' using errcode = '22023';
    end if;
    begin
      v_client_id := (p_input->>'id')::uuid;
      v_request_key := (p_input->>'creationRequestId')::uuid;
    exception when invalid_text_representation then
      raise exception 'chat_invalid_creation_identity' using errcode = '22023';
    end;
  end if;
  if v_type not in ('direct', 'group', 'channel', 'ai') then
    raise exception 'chat_invalid_conversation_type'
      using errcode = '22023';
  end if;

  if v_type in ('direct', 'group') then
    v_conversation_ws_id := private.chat_attachment_storage_workspace_id(
      p_ws_id,
      v_type,
      p_actor_user_id
    );

    perform private.chat_assert_workspace_permission(
      v_conversation_ws_id,
      p_actor_user_id,
      'view_chat'
    );
  else
    perform private.chat_assert_workspace_permission(
      p_ws_id,
      p_actor_user_id,
      'create_chat'
    );
  end if;

  if v_type = 'ai' then
    v_ai_enabled := true;
  end if;

  if v_initial is not null then
    if v_type <> 'ai' or jsonb_typeof(v_initial) <> 'object' then
      raise exception 'chat_invalid_initial_ai_settings' using errcode = '22023';
    end if;
    if (select count(*) from jsonb_object_keys(v_initial)) <> 4
      or not (v_initial ?& array['modelId', 'creditSource', 'creditWsId', 'thinkingMode'])
      or jsonb_typeof(v_initial->'modelId') <> 'string'
      or length(v_initial->>'modelId') not between 1 and 255
      or btrim(v_initial->>'modelId') <> v_initial->>'modelId'
      or coalesce(v_initial->>'creditSource', '') not in ('personal', 'workspace')
      or coalesce(v_initial->>'thinkingMode', '') not in ('fast', 'thinking')
      or (p_input->>'modelId' is not null and p_input->>'modelId' <> v_initial->>'modelId')
    then
      raise exception 'chat_invalid_initial_ai_settings' using errcode = '22023';
    end if;
    if jsonb_typeof(v_initial->'creditWsId') = 'null' then
      v_credit_ws_id := null;
    elsif jsonb_typeof(v_initial->'creditWsId') = 'string' then
      begin
        v_credit_ws_id := (v_initial->>'creditWsId')::uuid;
      exception when invalid_text_representation then
        raise exception 'chat_invalid_initial_ai_settings' using errcode = '22023';
      end;
    else
      raise exception 'chat_invalid_initial_ai_settings' using errcode = '22023';
    end if;
    v_billing_ws_id := p_ws_id;
    if v_initial->>'creditSource' = 'personal' then
      select w.id into v_billing_ws_id
      from public.workspaces w
      join public.workspace_members wm on wm.ws_id = w.id
      where w.personal = true and wm.user_id = p_actor_user_id
      order by w.id limit 1;
      if v_billing_ws_id is null then
        raise exception 'chat_invalid_credit_workspace' using errcode = '42501';
      end if;
    end if;
    if v_credit_ws_id is not null and v_credit_ws_id <> v_billing_ws_id then
      raise exception 'chat_invalid_credit_workspace' using errcode = '42501';
    end if;
  end if;

  if v_request_key is not null then
    perform pg_advisory_xact_lock(hashtextextended(
      concat_ws(':', 'chat-create-key', p_actor_user_id, p_ws_id, v_request_key), 0
    ));
    perform pg_advisory_xact_lock(hashtextextended('chat-create-id:' || v_client_id::text, 0));
    select * into v_creation from private.chat_creation_requests
    where conversation_id = v_client_id;
    if found then
      if v_creation.actor_user_id <> p_actor_user_id or v_creation.ws_id <> p_ws_id
        or v_creation.conversation_type <> v_type then
        raise exception 'chat_creation_forbidden' using errcode = '42501';
      end if;
      if v_creation.request_id <> v_request_key
        or v_creation.initial_settings is distinct from v_initial then
        raise exception 'chat_creation_payload_mismatch' using errcode = '22023';
      end if;
      if not exists(select 1 from private.chat_conversations c
        where c.id = v_client_id and c.created_by = p_actor_user_id
          and c.ws_id = p_ws_id and c.type = v_type and c.archived_at is null) then
        raise exception 'chat_creation_unavailable' using errcode = '42501';
      end if;
      v_receipt := private.chat_creation_receipt_json(v_client_id);
      return private.chat_conversation_json(v_client_id, p_actor_user_id)
        || jsonb_build_object('creationReceipt', v_receipt,
          'initialAiSettings', v_receipt->'initialAiSettings');
    end if;
    if exists(select 1 from private.chat_conversations where id = v_client_id) then
      raise exception 'chat_creation_forbidden' using errcode = '42501';
    end if;
    if exists(select 1 from private.chat_creation_requests
      where actor_user_id = p_actor_user_id and ws_id = p_ws_id and request_id = v_request_key) then
      raise exception 'chat_creation_payload_mismatch' using errcode = '22023';
    end if;
  end if;

  select coalesce(array_agg(distinct participant_id), '{}'::uuid[])
  into v_participant_ids
  from (
    select value::uuid as participant_id
    from jsonb_array_elements_text(coalesce(p_input->'participantUserIds', '[]'::jsonb))
  ) participants
  where participant_id <> p_actor_user_id;

  foreach v_user_id in array v_participant_ids loop
    if v_type in ('direct', 'group') then
      perform private.chat_assert_can_invite_user(p_actor_user_id, v_user_id);
    else
      perform private.chat_assert_workspace_member(p_ws_id, v_user_id);
    end if;
  end loop;

  if v_type = 'direct' then
    if array_length(v_participant_ids, 1) <> 1 then
      raise exception 'chat_direct_requires_one_target'
        using errcode = '22023';
    end if;

    v_target_user_id := v_participant_ids[1];

    select string_agg(user_id::text, ':' order by user_id::text)
    into v_direct_key
    from unnest(array[p_actor_user_id, v_target_user_id]) as user_id;

    perform pg_advisory_xact_lock(hashtextextended(v_direct_key, 0));

    select id
    into v_conversation_id
    from private.chat_conversations
    where type = 'direct'
      and direct_key = v_direct_key
      and archived_at is null
    order by created_at asc
    limit 1;

    if v_conversation_id is not null then
      v_member_ids := array_prepend(p_actor_user_id, v_participant_ids);

      foreach v_user_id in array v_member_ids loop
        insert into private.chat_conversation_members (
          conversation_id,
          user_id,
          role,
          last_read_at
        )
        values (
          v_conversation_id,
          v_user_id,
          case when v_user_id = p_actor_user_id then 'owner' else 'member' end,
          now()
        )
        on conflict (conversation_id, user_id) do update
        set archived_at = null;
      end loop;

      return private.chat_conversation_json(v_conversation_id, p_actor_user_id);
    end if;
  elsif v_type = 'group' then
    if array_length(v_participant_ids, 1) is null then
      raise exception 'chat_group_requires_members'
        using errcode = '22023';
    end if;
  end if;

  insert into private.chat_conversations (
    id,
    ws_id,
    type,
    title,
    description,
    direct_key,
    ai_enabled,
    metadata,
    created_by
  )
  values (
    coalesce(v_client_id, gen_random_uuid()),
    v_conversation_ws_id,
    v_type,
    case
      when v_type = 'direct' then null
      else v_title
    end,
    v_description,
    v_direct_key,
    v_ai_enabled,
    coalesce(p_input->'metadata', '{}'::jsonb),
    p_actor_user_id
  )
  returning id into v_conversation_id;

  v_member_ids := array_prepend(p_actor_user_id, v_participant_ids);

  foreach v_user_id in array v_member_ids loop
    insert into private.chat_conversation_members (
      conversation_id,
      user_id,
      role,
      last_read_at
    )
    values (
      v_conversation_id,
      v_user_id,
      case when v_user_id = p_actor_user_id then 'owner' else 'member' end,
      now()
    )
    on conflict (conversation_id, user_id) do update
    set archived_at = null;
  end loop;

  insert into private.chat_conversation_ai_settings (
    conversation_id,
    enabled,
    model_id,
    system_prompt,
    auto_reply,
    thinking_mode,
    credit_source,
    credit_ws_id,
    metadata
  )
  values (
    v_conversation_id,
    v_ai_enabled,
    coalesce(v_initial->>'modelId', nullif(p_input->>'modelId', '')),
    nullif(p_input->>'systemPrompt', ''),
    coalesce((p_input->>'autoReply')::boolean, false),
    coalesce(v_initial->>'thinkingMode', 'fast'),
    coalesce(v_initial->>'creditSource', 'workspace'),
    v_credit_ws_id,
    coalesce(p_input->'aiMetadata', '{}'::jsonb)
  )
  on conflict (conversation_id) do update
  set
    enabled = excluded.enabled,
    model_id = excluded.model_id,
    system_prompt = excluded.system_prompt,
    auto_reply = excluded.auto_reply,
    thinking_mode = excluded.thinking_mode,
    credit_source = excluded.credit_source,
    credit_ws_id = excluded.credit_ws_id,
    metadata = excluded.metadata;

  insert into private.chat_audit_events (
    ws_id,
    conversation_id,
    actor_id,
    event_type,
    metadata
  )
  values (
    v_conversation_ws_id,
    v_conversation_id,
    p_actor_user_id,
    'conversation.created',
    jsonb_build_object('type', v_type, 'participantIds', to_jsonb(v_participant_ids))
  );

  if v_request_key is not null then
    insert into private.chat_creation_requests (
      conversation_id, actor_user_id, ws_id, request_id, conversation_type, initial_settings
    ) values (v_conversation_id, p_actor_user_id, p_ws_id, v_request_key, v_type, v_initial);
    v_receipt := private.chat_creation_receipt_json(v_conversation_id);
    return private.chat_conversation_json(v_conversation_id, p_actor_user_id)
      || jsonb_build_object('creationReceipt', v_receipt,
        'initialAiSettings', v_receipt->'initialAiSettings');
  end if;

  if v_initial is not null then
    return private.chat_conversation_json(v_conversation_id, p_actor_user_id)
      || jsonb_build_object('initialAiSettings', (
        select jsonb_build_object(
          'conversationId', c.id, 'wsId', c.ws_id, 'actorUserId', c.created_by,
          'modelId', a.model_id, 'creditSource', a.credit_source,
          'creditWsId', a.credit_ws_id, 'thinkingMode', a.thinking_mode
        )
        from private.chat_conversations c
        join private.chat_conversation_ai_settings a on a.conversation_id = c.id
        where c.id = v_conversation_id
      ));
  end if;
  return private.chat_conversation_json(v_conversation_id, p_actor_user_id);
end;
$$;

-- Keep the existing three-argument signature and service-only execution boundary.
revoke all on function private.chat_create_conversation(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function private.chat_create_conversation(uuid, uuid, jsonb) to service_role;

create function private.chat_create_ai_first_message(
  p_ws_id uuid, p_actor_user_id uuid, p_input jsonb, p_content text
) returns jsonb language plpgsql security definer
set search_path = private, public, pg_temp as $$
declare
  v_conversation jsonb;
  v_persistence jsonb;
  v_request_id uuid;
begin
  if jsonb_typeof(p_input) <> 'object' or p_input->>'type' is distinct from 'ai'
    or p_input->>'id' is null or p_input->>'creationRequestId' is null
    or p_input->'initialAiSettings' is null
    or p_content is null or length(btrim(p_content)) = 0 or length(p_content) > 10000 then
    raise exception 'chat_invalid_first_message' using errcode = '22023';
  end if;
  v_conversation := private.chat_create_conversation(p_ws_id, p_actor_user_id, p_input);
  v_request_id := (p_input->>'creationRequestId')::uuid;
  v_persistence := private.chat_send_user_message_idempotent(
    p_ws_id, (v_conversation->>'id')::uuid, p_actor_user_id,
    v_request_id, p_content, null, '[]'::jsonb
  );
  if v_persistence->'message' is null or v_persistence->'message' = 'null'::jsonb then
    raise exception 'chat_first_message_unavailable' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'conversation', v_conversation, 'creationReceipt', v_conversation->'creationReceipt',
    'message', v_persistence->'message', 'replayed', v_persistence->'replayed'
  );
end;
$$;
revoke all on function private.chat_create_ai_first_message(uuid, uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function private.chat_create_ai_first_message(uuid, uuid, jsonb, text) to service_role;
notify pgrst, 'reload schema';
