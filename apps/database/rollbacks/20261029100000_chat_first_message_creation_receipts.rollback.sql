-- Rollback: chat first-message creation receipts.
-- Restores main's prior chat_create_conversation body from 20261018020000.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- Creation receipts prevent old retries resurrecting deleted conversations.
-- Dropping populated receipts loses that identity fence permanently; refuse it.
LOCK TABLE private.chat_creation_requests IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM private.chat_creation_requests) THEN
  RAISE EXCEPTION 'Rollback refused: chat creation receipts retain retry identities; verified recovery is required';
 END IF;
END $$;
DROP FUNCTION private.chat_create_ai_first_message(uuid, uuid, jsonb, text);
-- Preserve the existing signature, service-role-only ACL and creation transaction.
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
begin
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

REVOKE ALL ON FUNCTION private.chat_create_conversation(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.chat_create_conversation(uuid, uuid, jsonb) TO service_role;
DROP FUNCTION private.chat_creation_receipt_json(uuid);
DROP TABLE private.chat_creation_requests;
NOTIFY pgrst, 'reload schema';
COMMIT;
