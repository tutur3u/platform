create table if not exists private.chat_link_previews (
  normalized_url text primary key,
  url text not null,
  title text,
  description text,
  image_url text,
  site_name text,
  fetched_at timestamptz not null default now(),
  failed_at timestamptz,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  constraint chat_link_previews_normalized_url_length check (
    char_length(normalized_url) between 1 and 1200
  ),
  constraint chat_link_previews_url_length check (
    char_length(url) between 1 and 1200
  ),
  constraint chat_link_previews_title_length check (
    title is null or char_length(title) <= 300
  ),
  constraint chat_link_previews_description_length check (
    description is null or char_length(description) <= 800
  ),
  constraint chat_link_previews_image_url_length check (
    image_url is null or char_length(image_url) <= 1200
  ),
  constraint chat_link_previews_site_name_length check (
    site_name is null or char_length(site_name) <= 120
  )
);

create index if not exists chat_conversations_direct_key_global_lookup_idx
  on private.chat_conversations (direct_key, created_at)
  where type = 'direct' and direct_key is not null and archived_at is null;

alter table private.chat_link_previews enable row level security;
revoke all on table private.chat_link_previews from public, anon, authenticated;
grant all on table private.chat_link_previews to service_role;

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
    metadata
  )
  values (
    v_conversation_id,
    v_ai_enabled,
    nullif(p_input->>'modelId', ''),
    nullif(p_input->>'systemPrompt', ''),
    coalesce((p_input->>'autoReply')::boolean, false),
    coalesce(p_input->'aiMetadata', '{}'::jsonb)
  )
  on conflict (conversation_id) do update
  set
    enabled = excluded.enabled,
    model_id = excluded.model_id,
    system_prompt = excluded.system_prompt,
    auto_reply = excluded.auto_reply,
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

  return private.chat_conversation_json(v_conversation_id, p_actor_user_id);
end;
$$;

create or replace function private.chat_list_shared_content(
  p_ws_id uuid,
  p_conversation_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = private, public, pg_temp
as $$
begin
  if private.chat_get_conversation(
    p_ws_id,
    p_conversation_id,
    p_actor_user_id
  ) is null then
    raise exception 'chat_conversation_forbidden'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'links',
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'messageId', link_rows.message_id,
            'conversationId', p_conversation_id,
            'url', link_rows.url,
            'createdAt', link_rows.created_at,
            'sender', link_rows.sender
          )
          order by link_rows.created_at desc
        ),
        '[]'::jsonb
      )
      from (
        select
          m.id as message_id,
          m.created_at,
          private.chat_member_profile_json(c.ws_id, m.sender_id) as sender,
          regexp_replace(matches.url_parts[1], '[\.,;:!\?\)\]]+$', '') as url
        from private.chat_messages m
        join private.chat_conversations c on c.id = m.conversation_id
        cross join lateral regexp_matches(
          coalesce(m.content, ''),
          '(https?://[^[:space:]<>"'']+)',
          'g'
        ) as matches(url_parts)
        where m.conversation_id = p_conversation_id
          and m.deleted_at is null
      ) link_rows
    ),
    'files',
    (
      select coalesce(
        jsonb_agg(private.chat_attachment_json(a) order by a.created_at desc),
        '[]'::jsonb
      )
      from private.chat_message_attachments a
      where a.conversation_id = p_conversation_id
        and a.message_id is not null
        and a.deleted_at is null
        and (
          a.content_type is null
          or a.content_type not ilike 'image/%'
        )
    ),
    'photos',
    (
      select coalesce(
        jsonb_agg(private.chat_attachment_json(a) order by a.created_at desc),
        '[]'::jsonb
      )
      from private.chat_message_attachments a
      where a.conversation_id = p_conversation_id
        and a.message_id is not null
        and a.deleted_at is null
        and a.content_type ilike 'image/%'
    )
  );
end;
$$;

revoke all on function private.chat_list_shared_content(uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function private.chat_list_shared_content(uuid, uuid, uuid) to service_role;
