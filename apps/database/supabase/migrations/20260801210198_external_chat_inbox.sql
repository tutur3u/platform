
create or replace function private.external_chat_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  if new.updated_at is not distinct from old.updated_at then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

create trigger external_chat_binding_credentials_updated_at
  before update on private.external_chat_binding_credentials
  for each row execute function private.external_chat_set_updated_at();
create trigger external_chat_threads_updated_at
  before update on private.external_chat_threads
  for each row execute function private.external_chat_set_updated_at();
create trigger external_chat_sync_checkpoints_updated_at
  before update on private.external_chat_sync_checkpoints
  for each row execute function private.external_chat_set_updated_at();

create or replace function private.external_chat_conversation_json(
  p_conversation_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select jsonb_build_object(
    'id', c.id,
    'wsId', c.ws_id,
    'type', c.type,
    'title', c.title,
    'description', c.description,
    'aiEnabled', c.ai_enabled,
    'metadata', c.metadata,
    'createdBy', c.created_by,
    'createdAt', c.created_at::text,
    'updatedAt', c.updated_at::text,
    'archivedAt', c.archived_at::text,
    'memberCount', (
      select count(*)::int
      from private.chat_conversation_members cm_count
      where cm_count.conversation_id = c.id
        and cm_count.archived_at is null
    ),
    'unreadCount', (
      select count(*)::int
      from private.chat_messages m
      left join private.chat_conversation_members own_member
        on own_member.conversation_id = c.id
       and own_member.user_id = p_actor_user_id
      where m.conversation_id = c.id
        and m.deleted_at is null
        and coalesce(m.sender_id, '00000000-0000-0000-0000-000000000000'::uuid) <> p_actor_user_id
        and m.created_at > coalesce(own_member.last_read_at, '-infinity'::timestamptz)
    ),
    'latestMessage', (
      select private.chat_message_json(m_latest)
      from private.chat_messages m_latest
      where m_latest.conversation_id = c.id
        and m_latest.deleted_at is null
      order by m_latest.created_at desc
      limit 1
    ),
    'members', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', cm.id,
            'conversationId', cm.conversation_id,
            'userId', cm.user_id,
            'role', cm.role,
            'joinedAt', cm.joined_at::text,
            'lastReadAt', cm.last_read_at::text,
            'mutedAt', cm.muted_at::text,
            'pinnedAt', cm.pinned_at::text,
            'archivedAt', cm.archived_at::text,
            'user', private.chat_member_profile_json(c.ws_id, cm.user_id)
          )
          order by cm.role = 'owner' desc, cm.joined_at
        ),
        '[]'::jsonb
      )
      from private.chat_conversation_members cm
      where cm.conversation_id = c.id
        and cm.archived_at is null
    )
  )
  from private.chat_conversations c
  where c.id = p_conversation_id;
$$;

revoke all on function private.external_chat_conversation_json(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.external_chat_conversation_json(uuid, uuid)
  to service_role;

create or replace function private.external_chat_list_conversations(
  p_ws_id uuid,
  p_actor_user_id uuid,
  p_archived text default 'active',
  p_limit integer default 41,
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
  v_limit integer := least(greatest(coalesce(p_limit, 41), 1), 101);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if coalesce(p_offset, 0) > 1000 then
    raise exception 'external_chat_offset_too_large' using errcode = '22023';
  end if;

  perform private.chat_assert_workspace_permission(
    p_ws_id,
    p_actor_user_id,
    'view_chat'
  );

  return (
    select coalesce(
      jsonb_agg(
        page.conversation
        order by
          page.pinned_at is null,
          page.pinned_at desc,
          page.latest_at desc,
          page.created_at desc,
          page.id asc
      ),
      '[]'::jsonb
    )
    from (
      select ranked.*
      from (
        select
          private.external_chat_conversation_json(c.id, p_actor_user_id)
            || jsonb_build_object(
              'archivedAt',
              (coalesce(c.archived_at, own_member.archived_at))::text
            ) as conversation,
          own_member.pinned_at,
          coalesce(latest.latest_at, c.updated_at) as latest_at,
          c.created_at,
          c.id
        from private.external_chat_threads external_thread
        join private.chat_conversations c
          on c.id = external_thread.conversation_id
          and external_thread.ws_id = p_ws_id
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
              and (
                c.archived_at is not null
                or own_member.archived_at is not null
              )
            )
          )

      ) ranked
      order by
        ranked.pinned_at is null,
        ranked.pinned_at desc,
        ranked.latest_at desc,
        ranked.created_at desc,
        ranked.id asc
      limit v_limit
      offset v_offset
    ) page
  );
end;
$$;

revoke all on function private.external_chat_list_conversations(uuid, uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function private.external_chat_list_conversations(uuid, uuid, text, integer, integer)
  to service_role;
