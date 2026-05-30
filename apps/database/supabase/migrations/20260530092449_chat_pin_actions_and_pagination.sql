create or replace function private.chat_list_conversations(
  p_ws_id uuid,
  p_actor_user_id uuid,
  p_archived text default 'active',
  p_limit integer default null,
  p_offset integer default 0
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
  v_limit integer := case
    when p_limit is null then null
    else least(greatest(p_limit, 1), 200)
  end;
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
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
        order by
          ranked.pinned_at is null,
          ranked.pinned_at desc,
          ranked.latest_at desc,
          ranked.created_at desc
      ),
      '[]'::jsonb
    )
    from (
      select
        private.chat_conversation_json(c.id, p_actor_user_id)
          || jsonb_build_object(
            'archivedAt',
            (coalesce(c.archived_at, own_member.archived_at))::text
          ) as conversation,
        own_member.pinned_at,
        coalesce(latest.latest_at, c.updated_at) as latest_at,
        c.created_at
      from private.chat_conversations c
      left join private.chat_conversation_members own_member
        on own_member.conversation_id = c.id
        and own_member.user_id = p_actor_user_id
      left join lateral (
        select max(m.created_at) as latest_at
        from private.chat_messages m
        where m.conversation_id = c.id
          and m.deleted_at is null
      ) latest on true
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
            and private.chat_actor_can_access_conversation(c.id, p_actor_user_id)
          )
          or (
            v_archived in ('archived', 'all')
            and c.type in ('direct', 'group')
            and own_member.archived_at is not null
          )
        )
      order by
        own_member.pinned_at is null,
        own_member.pinned_at desc,
        coalesce(latest.latest_at, c.updated_at) desc,
        c.created_at desc
      limit v_limit
      offset v_offset
    ) ranked
  );
end;
$$;

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
  v_has_pinned boolean := p_input ? 'pinned';
  v_title text := nullif(btrim(coalesce(p_input->>'title', '')), '');
  v_description text := nullif(btrim(coalesce(p_input->>'description', '')), '');
  v_pinned boolean := coalesce((p_input->>'pinned')::boolean, false);
  v_title_changed boolean := false;
  v_description_changed boolean := false;
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
    and private.chat_can_address_conversation_workspace(
      p_ws_id,
      ws_id,
      type,
      p_actor_user_id
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

  if (v_has_title or v_has_description)
    and v_conversation.type in ('channel', 'ai')
    and not public.has_workspace_permission(
      v_conversation.ws_id,
      p_actor_user_id,
      'manage_chat'
    )
  then
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

  v_title_changed := v_has_title and v_title is distinct from v_conversation.title;
  v_description_changed :=
    v_has_description and v_description is distinct from v_conversation.description;

  if v_has_title or v_has_description then
    update private.chat_conversations
    set
      title = case when v_has_title then v_title else title end,
      description = case
        when v_has_description then v_description
        else description
      end
    where id = p_conversation_id;
  end if;

  if v_has_pinned and v_pinned then
    insert into private.chat_conversation_members (
      conversation_id,
      user_id,
      role,
      pinned_at,
      archived_at
    )
    values (
      p_conversation_id,
      p_actor_user_id,
      'member',
      now(),
      null
    )
    on conflict (conversation_id, user_id) do update
    set
      pinned_at = coalesce(private.chat_conversation_members.pinned_at, now()),
      archived_at = null;
  elsif v_has_pinned then
    update private.chat_conversation_members
    set pinned_at = null
    where conversation_id = p_conversation_id
      and user_id = p_actor_user_id;
  end if;

  if v_title_changed then
    insert into private.chat_messages (
      conversation_id,
      sender_id,
      kind,
      content,
      metadata
    )
    values (
      p_conversation_id,
      p_actor_user_id,
      'system',
      '',
      jsonb_build_object(
        'eventType',
        'conversation.renamed',
        'previousTitle',
        v_conversation.title,
        'title',
        v_title
      )
    );
  elsif v_description_changed then
    insert into private.chat_messages (
      conversation_id,
      sender_id,
      kind,
      content,
      metadata
    )
    values (
      p_conversation_id,
      p_actor_user_id,
      'system',
      '',
      jsonb_build_object(
        'eventType',
        'conversation.description_updated'
      )
    );
  end if;

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
    'conversation.updated',
    jsonb_build_object(
      'hasTitle',
      v_has_title,
      'hasDescription',
      v_has_description,
      'hasPinned',
      v_has_pinned,
      'pinned',
      case when v_has_pinned then to_jsonb(v_pinned) else 'null'::jsonb end,
      'titleChanged',
      v_title_changed,
      'descriptionChanged',
      v_description_changed,
      'type',
      v_conversation.type
    )
  );

  return private.chat_conversation_json(p_conversation_id, p_actor_user_id);
end;
$$;

revoke all on function private.chat_list_conversations(uuid, uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function private.chat_update_conversation(uuid, uuid, uuid, jsonb) from public, anon, authenticated;

grant execute on function private.chat_list_conversations(uuid, uuid, text, integer, integer) to service_role;
grant execute on function private.chat_update_conversation(uuid, uuid, uuid, jsonb) to service_role;
