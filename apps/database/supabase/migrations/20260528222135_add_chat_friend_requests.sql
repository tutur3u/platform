create table if not exists private.chat_friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references public.users(id) on update cascade on delete cascade,
  recipient_user_id uuid not null references public.users(id) on update cascade on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint chat_friend_requests_not_self check (requester_user_id <> recipient_user_id),
  constraint chat_friend_requests_status_check check (status in ('pending', 'accepted', 'declined'))
);

create unique index if not exists chat_friend_requests_active_pair_unique
  on private.chat_friend_requests (
    least(requester_user_id, recipient_user_id),
    greatest(requester_user_id, recipient_user_id)
  )
  where status in ('pending', 'accepted');

create index if not exists chat_friend_requests_recipient_status_idx
  on private.chat_friend_requests (recipient_user_id, status, created_at desc);

create index if not exists chat_friend_requests_requester_status_idx
  on private.chat_friend_requests (requester_user_id, status, created_at desc);

drop trigger if exists chat_friend_requests_updated_at
  on private.chat_friend_requests;

create trigger chat_friend_requests_updated_at
  before update on private.chat_friend_requests
  for each row
  execute function private.chat_set_updated_at();

create or replace function private.chat_friend_request_json(
  p_ws_id uuid,
  p_request_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select jsonb_build_object(
    'id', request.id,
    'requesterUserId', request.requester_user_id,
    'recipientUserId', request.recipient_user_id,
    'status', request.status,
    'createdAt', request.created_at,
    'updatedAt', request.updated_at,
    'respondedAt', request.responded_at,
    'requester', private.chat_member_profile_json(p_ws_id, request.requester_user_id),
    'recipient', private.chat_member_profile_json(p_ws_id, request.recipient_user_id)
  )
  from private.chat_friend_requests request
  where request.id = p_request_id;
$$;

create or replace function private.chat_users_share_workspace(
  p_actor_user_id uuid,
  p_target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select exists (
    select 1
    from public.workspace_members actor_member
    join public.workspace_members target_member
      on target_member.ws_id = actor_member.ws_id
     and target_member.user_id = p_target_user_id
    join public.workspaces workspace
      on workspace.id = actor_member.ws_id
     and workspace.deleted is not true
    where actor_member.user_id = p_actor_user_id
  );
$$;

create or replace function private.chat_users_are_friends(
  p_actor_user_id uuid,
  p_target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select exists (
    select 1
    from private.chat_friend_requests request
    where request.status = 'accepted'
      and (
        (
          request.requester_user_id = p_actor_user_id
          and request.recipient_user_id = p_target_user_id
        )
        or (
          request.requester_user_id = p_target_user_id
          and request.recipient_user_id = p_actor_user_id
        )
      )
  );
$$;

create or replace function private.chat_can_invite_user(
  p_actor_user_id uuid,
  p_target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select
    p_target_user_id <> p_actor_user_id
    and (
      private.chat_users_share_workspace(p_actor_user_id, p_target_user_id)
      or private.chat_users_are_friends(p_actor_user_id, p_target_user_id)
    );
$$;

create or replace function private.chat_assert_can_invite_user(
  p_actor_user_id uuid,
  p_target_user_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = private, public, pg_temp
as $$
begin
  if not private.chat_can_invite_user(p_actor_user_id, p_target_user_id) then
    raise exception 'chat_target_not_invitable'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function private.chat_list_friend_requests(
  p_ws_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with visible_requests as (
    select request.*
    from private.chat_friend_requests request
    where request.status in ('pending', 'accepted')
      and (
        request.requester_user_id = p_actor_user_id
        or request.recipient_user_id = p_actor_user_id
      )
  )
  select jsonb_build_object(
    'incoming',
    coalesce(
      jsonb_agg(private.chat_friend_request_json(p_ws_id, id) order by created_at desc)
        filter (where recipient_user_id = p_actor_user_id and status = 'pending'),
      '[]'::jsonb
    ),
    'outgoing',
    coalesce(
      jsonb_agg(private.chat_friend_request_json(p_ws_id, id) order by created_at desc)
        filter (where requester_user_id = p_actor_user_id and status = 'pending'),
      '[]'::jsonb
    ),
    'accepted',
    coalesce(
      jsonb_agg(private.chat_friend_request_json(p_ws_id, id) order by updated_at desc)
        filter (where status = 'accepted'),
      '[]'::jsonb
    )
  )
  from visible_requests;
$$;

create or replace function private.chat_create_friend_request_by_email(
  p_ws_id uuid,
  p_actor_user_id uuid,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, auth, pg_temp
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_request_id uuid;
  v_target_user_id uuid;
begin
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'chat_friend_email_invalid'
      using errcode = '22023';
  end if;

  select auth_user.id
  into v_target_user_id
  from auth.users auth_user
  where lower(auth_user.email) = v_email
  limit 1;

  if v_target_user_id is null then
    raise exception 'chat_friend_user_not_found'
      using errcode = 'P0002';
  end if;

  if v_target_user_id = p_actor_user_id then
    raise exception 'chat_friend_self_invalid'
      using errcode = '22023';
  end if;

  select request.id
  into v_request_id
  from private.chat_friend_requests request
  where request.status in ('pending', 'accepted')
    and (
      (
        request.requester_user_id = p_actor_user_id
        and request.recipient_user_id = v_target_user_id
      )
      or (
        request.requester_user_id = v_target_user_id
        and request.recipient_user_id = p_actor_user_id
      )
    )
  limit 1;

  if v_request_id is null then
    insert into private.chat_friend_requests (
      requester_user_id,
      recipient_user_id
    )
    values (
      p_actor_user_id,
      v_target_user_id
    )
    returning id into v_request_id;
  end if;

  return private.chat_friend_request_json(p_ws_id, v_request_id);
end;
$$;

create or replace function private.chat_respond_friend_request(
  p_ws_id uuid,
  p_actor_user_id uuid,
  p_request_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_request_id uuid;
begin
  if p_status not in ('accepted', 'declined') then
    raise exception 'chat_friend_response_invalid'
      using errcode = '22023';
  end if;

  update private.chat_friend_requests request
  set
    status = p_status,
    responded_at = now()
  where request.id = p_request_id
    and request.recipient_user_id = p_actor_user_id
    and request.status = 'pending'
  returning request.id into v_request_id;

  if v_request_id is null then
    raise exception 'chat_friend_request_not_found'
      using errcode = 'P0002';
  end if;

  return private.chat_friend_request_json(p_ws_id, v_request_id);
end;
$$;

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
  v_participant_ids uuid[] := '{}'::uuid[];
  v_member_ids uuid[] := '{}'::uuid[];
  v_target_user_id uuid;
  v_direct_key text;
  v_conversation_id uuid;
  v_user_id uuid;
begin
  perform private.chat_assert_workspace_permission(
    p_ws_id,
    p_actor_user_id,
    'create_chat'
  );

  if v_type not in ('direct', 'group', 'channel', 'ai') then
    raise exception 'chat_invalid_conversation_type'
      using errcode = '22023';
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

    select id
    into v_conversation_id
    from private.chat_conversations
    where ws_id = p_ws_id
      and type = 'direct'
      and direct_key = v_direct_key
      and archived_at is null
    limit 1;

    if v_conversation_id is not null then
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
    p_ws_id,
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

  return private.chat_conversation_json(v_conversation_id, p_actor_user_id);
end;
$$;

create or replace function private.chat_search_directory(
  p_ws_id uuid,
  p_actor_user_id uuid,
  p_query text default null,
  p_limit integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
begin
  perform private.chat_assert_workspace_permission(
    p_ws_id,
    p_actor_user_id,
    'view_chat'
  );

  return (
    select coalesce(
      jsonb_agg(private.chat_member_profile_json(p_ws_id, ranked.user_id) order by ranked.rank, ranked.display_name),
      '[]'::jsonb
    )
    from (
      select
        eligible.user_id,
        coalesce(wu.display_name, u.display_name, u.handle, '') as display_name,
        case
          when v_query is null then 10
          when coalesce(wu.display_name, u.display_name, u.handle, '') ilike v_query || '%' then 0
          when coalesce(wu.display_name, u.display_name, u.handle, '') ilike '%' || v_query || '%' then 1
          else 2
        end as rank
      from (
        select distinct target_member.user_id
        from public.workspace_members actor_member
        join public.workspace_members target_member
          on target_member.ws_id = actor_member.ws_id
         and target_member.user_id <> p_actor_user_id
        join public.workspaces workspace
          on workspace.id = actor_member.ws_id
         and workspace.deleted is not true
        where actor_member.user_id = p_actor_user_id
        union
        select
          case
            when request.requester_user_id = p_actor_user_id then request.recipient_user_id
            else request.requester_user_id
          end as user_id
        from private.chat_friend_requests request
        where request.status = 'accepted'
          and (
            request.requester_user_id = p_actor_user_id
            or request.recipient_user_id = p_actor_user_id
          )
      ) eligible
      join public.users u on u.id = eligible.user_id
      left join lateral (
        select workspace_users.display_name
        from public.workspace_user_linked_users wul
        join public.workspace_users
          on workspace_users.id = wul.virtual_user_id
         and workspace_users.ws_id = wul.ws_id
        where wul.ws_id = p_ws_id
          and wul.platform_user_id = eligible.user_id
          and workspace_users.archived = false
        order by workspace_users.updated_at desc
        limit 1
      ) wu on true
      where (
        v_query is null
        or coalesce(wu.display_name, u.display_name, u.handle, '') ilike '%' || v_query || '%'
      )
      order by rank, display_name
      limit v_limit
    ) ranked
  );
end;
$$;

revoke all on table private.chat_friend_requests from public, anon, authenticated;
revoke all on function private.chat_friend_request_json(uuid, uuid) from public, anon, authenticated;
revoke all on function private.chat_users_share_workspace(uuid, uuid) from public, anon, authenticated;
revoke all on function private.chat_users_are_friends(uuid, uuid) from public, anon, authenticated;
revoke all on function private.chat_can_invite_user(uuid, uuid) from public, anon, authenticated;
revoke all on function private.chat_assert_can_invite_user(uuid, uuid) from public, anon, authenticated;
revoke all on function private.chat_list_friend_requests(uuid, uuid) from public, anon, authenticated;
revoke all on function private.chat_create_friend_request_by_email(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.chat_respond_friend_request(uuid, uuid, uuid, text) from public, anon, authenticated;

grant all on table private.chat_friend_requests to service_role;
grant execute on function private.chat_friend_request_json(uuid, uuid) to service_role;
grant execute on function private.chat_users_share_workspace(uuid, uuid) to service_role;
grant execute on function private.chat_users_are_friends(uuid, uuid) to service_role;
grant execute on function private.chat_can_invite_user(uuid, uuid) to service_role;
grant execute on function private.chat_assert_can_invite_user(uuid, uuid) to service_role;
grant execute on function private.chat_list_friend_requests(uuid, uuid) to service_role;
grant execute on function private.chat_create_friend_request_by_email(uuid, uuid, text) to service_role;
grant execute on function private.chat_respond_friend_request(uuid, uuid, uuid, text) to service_role;

alter table private.chat_message_attachments
  add column if not exists storage_ws_id uuid references public.workspaces(id) on update cascade on delete restrict;

update private.chat_message_attachments attachment
set storage_ws_id = conversation.ws_id
from private.chat_conversations conversation
where attachment.conversation_id = conversation.id
  and attachment.storage_ws_id is null;

create or replace function private.chat_is_actor_personal_workspace(
  p_ws_id uuid,
  p_actor_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select exists (
    select 1
    from public.workspaces workspace
    where workspace.id = p_ws_id
      and workspace.creator_id = p_actor_user_id
      and workspace.personal = true
      and workspace.deleted is not true
  );
$$;

create or replace function private.chat_attachment_storage_workspace_id(
  p_ws_id uuid,
  p_conversation_type text,
  p_actor_user_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_storage_ws_id uuid := p_ws_id;
begin
  if p_conversation_type in ('direct', 'group') then
    select workspace.id
    into v_storage_ws_id
    from public.workspaces workspace
    where workspace.creator_id = p_actor_user_id
      and workspace.personal = true
      and workspace.deleted is not true
    order by workspace.created_at asc nulls last
    limit 1;

    if v_storage_ws_id is null then
      raise exception 'chat_personal_storage_workspace_not_found'
        using errcode = 'P0002';
    end if;
  end if;

  return v_storage_ws_id;
end;
$$;

create or replace function private.chat_attachment_json(
  a private.chat_message_attachments
)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select jsonb_build_object(
    'id', a.id,
    'conversationId', a.conversation_id,
    'messageId', a.message_id,
    'uploaderId', a.uploader_id,
    'storagePath', a.storage_path,
    'storageWsId', a.storage_ws_id,
    'fullPath', a.full_path,
    'filename', a.filename,
    'contentType', a.content_type,
    'sizeBytes', a.size_bytes,
    'createdAt', a.created_at
  );
$$;

create or replace function private.chat_prepare_attachment(
  p_ws_id uuid,
  p_conversation_id uuid,
  p_actor_user_id uuid,
  p_filename text,
  p_size_bytes bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_conversation private.chat_conversations%rowtype;
  v_filename text := btrim(coalesce(p_filename, ''));
  v_storage_ws_id uuid;
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

  if char_length(v_filename) = 0 or char_length(v_filename) > 255 then
    raise exception 'chat_invalid_attachment_filename'
      using errcode = '22023';
  end if;

  if p_size_bytes is not null and (p_size_bytes < 0 or p_size_bytes > 104857600) then
    raise exception 'chat_attachment_too_large'
      using errcode = '22023';
  end if;

  v_storage_ws_id := private.chat_attachment_storage_workspace_id(
    p_ws_id,
    v_conversation.type,
    p_actor_user_id
  );

  return jsonb_build_object(
    'conversationId', p_conversation_id,
    'pathPrefix', format('chats/%s', p_conversation_id),
    'storageWsId', v_storage_ws_id,
    'maxSizeBytes', 104857600
  );
end;
$$;

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
    p_actor_user_id,
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

create or replace function private.chat_finalize_attachment(
  p_ws_id uuid,
  p_conversation_id uuid,
  p_actor_user_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_attachment_id uuid;
  v_conversation private.chat_conversations%rowtype;
  v_storage_path text := p_payload->>'path';
  v_storage_ws_id uuid;
  v_expected_storage_ws_id uuid;
  v_full_path text := p_payload->>'fullPath';
  v_size_bytes bigint := nullif(p_payload->>'sizeBytes', '')::bigint;
begin
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

  perform private.chat_prepare_attachment(
    p_ws_id,
    p_conversation_id,
    p_actor_user_id,
    coalesce(p_payload->>'filename', 'attachment'),
    v_size_bytes
  );

  v_expected_storage_ws_id := private.chat_attachment_storage_workspace_id(
    p_ws_id,
    v_conversation.type,
    p_actor_user_id
  );
  v_storage_ws_id := coalesce(
    nullif(p_payload->>'storageWsId', '')::uuid,
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
    p_actor_user_id,
    v_storage_ws_id,
    v_storage_path,
    v_full_path,
    coalesce(nullif(p_payload->>'filename', ''), 'attachment'),
    nullif(p_payload->>'contentType', ''),
    v_size_bytes,
    coalesce(p_payload->'metadata', '{}'::jsonb)
  )
  returning id into v_attachment_id;

  return (
    select private.chat_attachment_json(a)
    from private.chat_message_attachments a
    where a.id = v_attachment_id
  );
end;
$$;

create or replace function private.chat_delete_conversation(
  p_ws_id uuid,
  p_conversation_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_conversation private.chat_conversations%rowtype;
  v_member_id uuid;
  v_mode text;
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

  if v_conversation.type in ('direct', 'group') then
    update private.chat_conversation_members
    set archived_at = now()
    where conversation_id = p_conversation_id
      and user_id = p_actor_user_id
      and archived_at is null
    returning id into v_member_id;

    if v_member_id is null then
      raise exception 'chat_conversation_member_required'
        using errcode = '42501';
    end if;

    v_mode := 'left';
  else
    if not public.has_workspace_permission(
      p_ws_id,
      p_actor_user_id,
      'manage_chat'
    ) then
      raise exception 'chat_manage_permission_required'
        using errcode = '42501';
    end if;

    update private.chat_conversations
    set archived_at = now()
    where id = p_conversation_id;

    update private.chat_conversation_members
    set archived_at = now()
    where conversation_id = p_conversation_id
      and archived_at is null;

    v_mode := 'archived';
  end if;

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
    'conversation.deleted',
    jsonb_build_object(
      'mode',
      v_mode,
      'type',
      v_conversation.type
    )
  );

  return jsonb_build_object(
    'conversationId', p_conversation_id,
    'mode', v_mode,
    'type', v_conversation.type
  );
end;
$$;

create or replace function private.chat_list_conversations(
  p_ws_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = private, public, pg_temp
as $$
begin
  perform private.chat_assert_workspace_permission(
    p_ws_id,
    p_actor_user_id,
    'view_chat'
  );

  return (
    select coalesce(
      jsonb_agg(
        private.chat_conversation_json(c.id, p_actor_user_id)
        order by coalesce(latest.latest_at, c.updated_at) desc, c.created_at desc
      ),
      '[]'::jsonb
    )
    from private.chat_conversations c
    left join lateral (
      select max(m.created_at) as latest_at
      from private.chat_messages m
      where m.conversation_id = c.id
        and m.deleted_at is null
    ) latest on true
    where c.archived_at is null
      and (
        c.ws_id = p_ws_id
        or (
          c.type in ('direct', 'group')
          and private.chat_is_actor_personal_workspace(p_ws_id, p_actor_user_id)
        )
      )
      and private.chat_actor_can_access_conversation(c.id, p_actor_user_id)
  );
end;
$$;

create or replace function private.chat_get_conversation(
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
declare
  v_conversation private.chat_conversations%rowtype;
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

  return private.chat_conversation_json(p_conversation_id, p_actor_user_id);
end;
$$;

create or replace function private.chat_list_messages(
  p_ws_id uuid,
  p_conversation_id uuid,
  p_actor_user_id uuid,
  p_limit integer default 60,
  p_before timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 60), 1), 100);
begin
  if private.chat_get_conversation(
    p_ws_id,
    p_conversation_id,
    p_actor_user_id
  ) is null then
    return '[]'::jsonb;
  end if;

  return (
    select coalesce(jsonb_agg(private.chat_message_json(m) order by m.created_at), '[]'::jsonb)
    from (
      select *
      from private.chat_messages
      where conversation_id = p_conversation_id
        and (p_before is null or created_at < p_before)
      order by created_at desc
      limit v_limit
    ) m
  );
end;
$$;

create or replace function private.chat_search_messages(
  p_ws_id uuid,
  p_actor_user_id uuid,
  p_query text,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  perform private.chat_assert_workspace_permission(
    p_ws_id,
    p_actor_user_id,
    'view_chat'
  );

  if v_query is null then
    return '[]'::jsonb;
  end if;

  return (
    select coalesce(jsonb_agg(private.chat_message_json(m) order by m.created_at desc), '[]'::jsonb)
    from private.chat_messages m
    join private.chat_conversations c
      on c.id = m.conversation_id
     and c.archived_at is null
     and (
       c.ws_id = p_ws_id
       or (
         c.type in ('direct', 'group')
         and private.chat_is_actor_personal_workspace(p_ws_id, p_actor_user_id)
       )
     )
    where m.deleted_at is null
      and m.content ilike '%' || v_query || '%'
      and private.chat_actor_can_access_conversation(c.id, p_actor_user_id)
    limit v_limit
  );
end;
$$;

create or replace function private.chat_get_attachment(
  p_ws_id uuid,
  p_conversation_id uuid,
  p_actor_user_id uuid,
  p_attachment_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_attachment private.chat_message_attachments;
begin
  if private.chat_get_conversation(
    p_ws_id,
    p_conversation_id,
    p_actor_user_id
  ) is null then
    raise exception 'chat_conversation_forbidden'
      using errcode = '42501';
  end if;

  select a.*
  into v_attachment
  from private.chat_message_attachments a
  where a.id = p_attachment_id
    and a.conversation_id = p_conversation_id
    and a.message_id is not null
  limit 1;

  if v_attachment.id is null then
    raise exception 'chat_attachment_not_found'
      using errcode = '22023';
  end if;

  return private.chat_attachment_json(v_attachment);
end;
$$;

revoke all on function private.chat_is_actor_personal_workspace(uuid, uuid) from public, anon, authenticated;
revoke all on function private.chat_attachment_storage_workspace_id(uuid, text, uuid) from public, anon, authenticated;
revoke all on function private.chat_delete_conversation(uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function private.chat_is_actor_personal_workspace(uuid, uuid) to service_role;
grant execute on function private.chat_attachment_storage_workspace_id(uuid, text, uuid) to service_role;
grant execute on function private.chat_delete_conversation(uuid, uuid, uuid) to service_role;
