create schema if not exists private;

grant usage on schema private to service_role;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  type text not null default 'channel',
  title text,
  description text,
  direct_key text,
  ai_enabled boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint chat_conversations_type_check check (
    type in ('direct', 'group', 'channel', 'ai')
  ),
  constraint chat_conversations_title_length_check check (
    title is null or char_length(title) <= 255
  ),
  constraint chat_conversations_description_length_check check (
    description is null or char_length(description) <= 2000
  ),
  constraint chat_conversations_direct_key_check check (
    (type = 'direct' and direct_key is not null)
    or (type <> 'direct' and direct_key is null)
  )
);

create unique index if not exists chat_conversations_direct_key_idx
  on private.chat_conversations (ws_id, direct_key)
  where direct_key is not null and archived_at is null;

create index if not exists chat_conversations_ws_updated_idx
  on private.chat_conversations (ws_id, updated_at desc)
  where archived_at is null;

create table if not exists private.chat_conversation_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references private.chat_conversations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  last_seen_message_id uuid,
  muted_at timestamptz,
  pinned_at timestamptz,
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint chat_conversation_members_role_check check (
    role in ('owner', 'admin', 'member', 'assistant')
  ),
  unique (conversation_id, user_id)
);

create index if not exists chat_conversation_members_user_idx
  on private.chat_conversation_members (user_id, conversation_id)
  where archived_at is null;

create table if not exists private.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references private.chat_conversations(id) on delete cascade,
  sender_id uuid references public.users(id) on delete set null,
  kind text not null default 'user',
  content text not null default '',
  reply_to_message_id uuid references private.chat_messages(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint chat_messages_kind_check check (
    kind in ('user', 'assistant', 'system')
  ),
  constraint chat_messages_content_length_check check (
    char_length(content) <= 10000
  ),
  constraint chat_messages_content_bytes_check check (
    octet_length(content) <= 40000
  )
);

create index if not exists chat_messages_conversation_created_idx
  on private.chat_messages (conversation_id, created_at desc)
  where deleted_at is null;

create index if not exists chat_messages_search_idx
  on private.chat_messages
  using gin (to_tsvector('simple', coalesce(content, '')))
  where deleted_at is null;

create table if not exists private.chat_message_attachments (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references private.chat_conversations(id) on delete cascade,
  message_id uuid references private.chat_messages(id) on delete cascade,
  uploader_id uuid references public.users(id) on delete set null,
  storage_path text not null,
  full_path text,
  filename text not null,
  content_type text,
  size_bytes bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chat_message_attachments_filename_length_check check (
    char_length(filename) between 1 and 255
  ),
  constraint chat_message_attachments_storage_path_length_check check (
    char_length(storage_path) between 1 and 1024
  ),
  constraint chat_message_attachments_size_check check (
    size_bytes is null or size_bytes between 0 and 104857600
  )
);

create index if not exists chat_message_attachments_message_idx
  on private.chat_message_attachments (message_id, created_at)
  where deleted_at is null;

create index if not exists chat_message_attachments_conversation_idx
  on private.chat_message_attachments (conversation_id, created_at desc)
  where deleted_at is null;

create table if not exists private.chat_message_reactions (
  message_id uuid not null references private.chat_messages(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji),
  constraint chat_message_reactions_emoji_length_check check (
    char_length(emoji) between 1 and 64
  )
);

create table if not exists private.chat_conversation_ai_settings (
  conversation_id uuid primary key references private.chat_conversations(id) on delete cascade,
  enabled boolean not null default false,
  model_id text,
  system_prompt text,
  auto_reply boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_ai_settings_system_prompt_length_check check (
    system_prompt is null or char_length(system_prompt) <= 10000
  )
);

create table if not exists private.chat_audit_events (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid references private.chat_conversations(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint chat_audit_events_event_type_length_check check (
    char_length(event_type) between 1 and 120
  )
);

create index if not exists chat_audit_events_ws_created_idx
  on private.chat_audit_events (ws_id, created_at desc);

alter table private.chat_conversations enable row level security;
alter table private.chat_conversation_members enable row level security;
alter table private.chat_messages enable row level security;
alter table private.chat_message_attachments enable row level security;
alter table private.chat_message_reactions enable row level security;
alter table private.chat_conversation_ai_settings enable row level security;
alter table private.chat_audit_events enable row level security;

revoke all on table private.chat_conversations from public, anon, authenticated;
revoke all on table private.chat_conversation_members from public, anon, authenticated;
revoke all on table private.chat_messages from public, anon, authenticated;
revoke all on table private.chat_message_attachments from public, anon, authenticated;
revoke all on table private.chat_message_reactions from public, anon, authenticated;
revoke all on table private.chat_conversation_ai_settings from public, anon, authenticated;
revoke all on table private.chat_audit_events from public, anon, authenticated;

grant all on table private.chat_conversations to service_role;
grant all on table private.chat_conversation_members to service_role;
grant all on table private.chat_messages to service_role;
grant all on table private.chat_message_attachments to service_role;
grant all on table private.chat_message_reactions to service_role;
grant all on table private.chat_conversation_ai_settings to service_role;
grant all on table private.chat_audit_events to service_role;

create or replace function private.chat_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists chat_conversations_set_updated_at
  on private.chat_conversations;
create trigger chat_conversations_set_updated_at
  before update on private.chat_conversations
  for each row execute function private.chat_set_updated_at();

drop trigger if exists chat_conversation_ai_settings_set_updated_at
  on private.chat_conversation_ai_settings;
create trigger chat_conversation_ai_settings_set_updated_at
  before update on private.chat_conversation_ai_settings
  for each row execute function private.chat_set_updated_at();

create or replace function private.chat_assert_workspace_permission(
  p_ws_id uuid,
  p_actor_user_id uuid,
  p_permission text
)
returns void
language plpgsql
stable
security definer
set search_path = private, public, pg_temp
as $$
begin
  if p_ws_id is null or p_actor_user_id is null then
    raise exception 'chat_invalid_actor_context'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.ws_id = p_ws_id
      and wm.user_id = p_actor_user_id
  ) then
    raise exception 'chat_workspace_membership_required'
      using errcode = '42501';
  end if;

  if not public.has_workspace_permission(
    p_ws_id,
    p_actor_user_id,
    p_permission
  ) then
    raise exception 'chat_permission_required:%', p_permission
      using errcode = '42501';
  end if;
end;
$$;

create or replace function private.chat_assert_workspace_member(
  p_ws_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = private, public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.workspace_members wm
    where wm.ws_id = p_ws_id
      and wm.user_id = p_user_id
  ) then
    raise exception 'chat_target_not_workspace_member'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function private.chat_actor_can_access_conversation(
  p_conversation_id uuid,
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
    from private.chat_conversations c
    where c.id = p_conversation_id
      and c.archived_at is null
      and (
        exists (
          select 1
          from private.chat_conversation_members cm
          where cm.conversation_id = c.id
            and cm.user_id = p_actor_user_id
            and cm.archived_at is null
        )
        or (
          c.type = 'channel'
          and public.has_workspace_permission(
            c.ws_id,
            p_actor_user_id,
            'view_chat'
          )
        )
      )
  );
$$;

create or replace function private.chat_member_profile_json(
  p_ws_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = private, public, pg_temp
as $$
declare
  profile jsonb;
begin
  select jsonb_build_object(
    'id', u.id,
    'displayName', coalesce(wu.display_name, u.display_name, u.handle, 'Unknown user'),
    'avatarUrl', coalesce(wu.avatar_url, u.avatar_url),
    'handle', u.handle
  )
  into profile
  from public.users u
  left join lateral (
    select workspace_users.display_name, workspace_users.avatar_url
    from public.workspace_user_linked_users wul
    join public.workspace_users
      on workspace_users.id = wul.virtual_user_id
     and workspace_users.ws_id = wul.ws_id
    where wul.ws_id = p_ws_id
      and wul.platform_user_id = u.id
      and workspace_users.archived = false
    order by workspace_users.updated_at desc
    limit 1
  ) wu on true
  where u.id = p_user_id;

  return coalesce(
    profile,
    jsonb_build_object(
      'id', p_user_id,
      'displayName', 'Unknown user',
      'avatarUrl', null,
      'handle', null
    )
  );
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
    'fullPath', a.full_path,
    'filename', a.filename,
    'contentType', a.content_type,
    'sizeBytes', a.size_bytes,
    'createdAt', a.created_at::text
  );
$$;

create or replace function private.chat_message_json(
  m private.chat_messages
)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select jsonb_build_object(
    'id', m.id,
    'conversationId', m.conversation_id,
    'senderId', m.sender_id,
    'sender', case
      when m.sender_id is null then null
      else private.chat_member_profile_json(c.ws_id, m.sender_id)
    end,
    'kind', m.kind,
    'content', case when m.deleted_at is null then m.content else '' end,
    'replyToMessageId', m.reply_to_message_id,
    'metadata', m.metadata,
    'createdAt', m.created_at::text,
    'updatedAt', m.updated_at::text,
    'editedAt', m.edited_at::text,
    'deletedAt', m.deleted_at::text,
    'attachments', (
      select coalesce(jsonb_agg(private.chat_attachment_json(a) order by a.created_at), '[]'::jsonb)
      from private.chat_message_attachments a
      where a.message_id = m.id
        and a.deleted_at is null
    ),
    'reactions', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'emoji', r.emoji,
            'count', r.reaction_count,
            'userIds', r.user_ids
          )
          order by r.emoji
        ),
        '[]'::jsonb
      )
      from (
        select
          emoji,
          count(*)::int as reaction_count,
          jsonb_agg(user_id order by created_at) as user_ids
        from private.chat_message_reactions
        where message_id = m.id
        group by emoji
      ) r
    )
  )
  from private.chat_conversations c
  where c.id = m.conversation_id;
$$;

create or replace function private.chat_conversation_json(
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
  conversation_json jsonb;
begin
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
  into conversation_json
  from private.chat_conversations c
  where c.id = p_conversation_id
    and c.archived_at is null;

  return conversation_json;
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
    where c.ws_id = p_ws_id
      and c.archived_at is null
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
begin
  perform private.chat_assert_workspace_permission(
    p_ws_id,
    p_actor_user_id,
    'view_chat'
  );

  if not exists (
    select 1
    from private.chat_conversations c
    where c.id = p_conversation_id
      and c.ws_id = p_ws_id
      and c.archived_at is null
  ) then
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
    perform private.chat_assert_workspace_member(p_ws_id, v_user_id);
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

  insert into private.chat_audit_events (
    ws_id,
    conversation_id,
    actor_id,
    event_type,
    metadata
  )
  values (
    p_ws_id,
    v_conversation_id,
    p_actor_user_id,
    'conversation.created',
    jsonb_build_object('type', v_type, 'participantIds', to_jsonb(v_participant_ids))
  );

  return private.chat_conversation_json(v_conversation_id, p_actor_user_id);
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
  perform private.chat_assert_workspace_permission(
    p_ws_id,
    p_actor_user_id,
    'view_chat'
  );

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
    and ws_id = p_ws_id
    and archived_at is null;

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

    if v_storage_path is null or not starts_with(
      v_storage_path,
      format('chats/%s/', p_conversation_id)
    ) then
      raise exception 'chat_attachment_path_forbidden'
        using errcode = '42501';
    end if;

    if v_full_path is not null and not starts_with(
      v_full_path,
      format('%s/chats/%s/', p_ws_id, p_conversation_id)
    ) then
      raise exception 'chat_attachment_full_path_forbidden'
        using errcode = '42501';
    end if;

    insert into private.chat_message_attachments (
      conversation_id,
      message_id,
      uploader_id,
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

create or replace function private.chat_edit_message(
  p_ws_id uuid,
  p_conversation_id uuid,
  p_actor_user_id uuid,
  p_message_id uuid,
  p_content text
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_message private.chat_messages%rowtype;
begin
  perform private.chat_assert_workspace_permission(
    p_ws_id,
    p_actor_user_id,
    'view_chat'
  );

  if not private.chat_actor_can_access_conversation(
    p_conversation_id,
    p_actor_user_id
  ) then
    raise exception 'chat_conversation_forbidden'
      using errcode = '42501';
  end if;

  select m.*
  into v_message
  from private.chat_messages m
  join private.chat_conversations c
    on c.id = m.conversation_id
   and c.ws_id = p_ws_id
  where m.id = p_message_id
    and m.conversation_id = p_conversation_id
    and m.deleted_at is null
  limit 1;

  if v_message.id is null then
    raise exception 'chat_message_not_found'
      using errcode = '22023';
  end if;

  if v_message.sender_id is distinct from p_actor_user_id
    and not public.has_workspace_permission(
      p_ws_id,
      p_actor_user_id,
      'moderate_chat'
    ) then
    raise exception 'chat_message_owner_required'
      using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_content, ''))) = 0 then
    raise exception 'chat_message_empty'
      using errcode = '22023';
  end if;

  update private.chat_messages
  set
    content = left(p_content, 10000),
    edited_at = now(),
    updated_at = now()
  where id = p_message_id;

  update private.chat_conversations
  set updated_at = now()
  where id = p_conversation_id;

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
    'message.edited',
    jsonb_build_object('messageId', p_message_id)
  );

  return (
    select private.chat_message_json(m)
    from private.chat_messages m
    where m.id = p_message_id
  );
end;
$$;

create or replace function private.chat_delete_message(
  p_ws_id uuid,
  p_conversation_id uuid,
  p_actor_user_id uuid,
  p_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_message private.chat_messages%rowtype;
begin
  perform private.chat_assert_workspace_permission(
    p_ws_id,
    p_actor_user_id,
    'view_chat'
  );

  if not private.chat_actor_can_access_conversation(
    p_conversation_id,
    p_actor_user_id
  ) then
    raise exception 'chat_conversation_forbidden'
      using errcode = '42501';
  end if;

  select m.*
  into v_message
  from private.chat_messages m
  join private.chat_conversations c
    on c.id = m.conversation_id
   and c.ws_id = p_ws_id
  where m.id = p_message_id
    and m.conversation_id = p_conversation_id
    and m.deleted_at is null
  limit 1;

  if v_message.id is null then
    raise exception 'chat_message_not_found'
      using errcode = '22023';
  end if;

  if v_message.sender_id is distinct from p_actor_user_id
    and not public.has_workspace_permission(
      p_ws_id,
      p_actor_user_id,
      'moderate_chat'
    ) then
    raise exception 'chat_message_owner_required'
      using errcode = '42501';
  end if;

  update private.chat_messages
  set
    content = '',
    deleted_at = now(),
    updated_at = now()
  where id = p_message_id;

  update private.chat_conversations
  set updated_at = now()
  where id = p_conversation_id;

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
    'message.deleted',
    jsonb_build_object('messageId', p_message_id)
  );

  return (
    select private.chat_message_json(m)
    from private.chat_messages m
    where m.id = p_message_id
  );
end;
$$;

create or replace function private.chat_set_read_state(
  p_ws_id uuid,
  p_conversation_id uuid,
  p_actor_user_id uuid,
  p_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_read_at timestamptz := now();
begin
  perform private.chat_assert_workspace_permission(
    p_ws_id,
    p_actor_user_id,
    'view_chat'
  );

  if private.chat_get_conversation(
    p_ws_id,
    p_conversation_id,
    p_actor_user_id
  ) is null then
    return null;
  end if;

  if p_message_id is not null then
    select created_at
    into v_read_at
    from private.chat_messages
    where id = p_message_id
      and conversation_id = p_conversation_id
      and deleted_at is null;

    if v_read_at is null then
      raise exception 'chat_read_message_not_found'
        using errcode = '22023';
    end if;
  end if;

  insert into private.chat_conversation_members (
    conversation_id,
    user_id,
    role,
    last_read_at,
    last_seen_message_id
  )
  values (
    p_conversation_id,
    p_actor_user_id,
    'member',
    v_read_at,
    p_message_id
  )
  on conflict (conversation_id, user_id) do update
  set
    last_read_at = greatest(
      coalesce(private.chat_conversation_members.last_read_at, '-infinity'::timestamptz),
      excluded.last_read_at
    ),
    last_seen_message_id = coalesce(excluded.last_seen_message_id, private.chat_conversation_members.last_seen_message_id),
    archived_at = null;

  return private.chat_conversation_json(p_conversation_id, p_actor_user_id);
end;
$$;

create or replace function private.chat_toggle_reaction(
  p_ws_id uuid,
  p_conversation_id uuid,
  p_message_id uuid,
  p_actor_user_id uuid,
  p_emoji text
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_emoji text := btrim(coalesce(p_emoji, ''));
begin
  perform private.chat_assert_workspace_permission(
    p_ws_id,
    p_actor_user_id,
    'view_chat'
  );

  if private.chat_get_conversation(
    p_ws_id,
    p_conversation_id,
    p_actor_user_id
  ) is null then
    return null;
  end if;

  if char_length(v_emoji) = 0 or char_length(v_emoji) > 64 then
    raise exception 'chat_invalid_reaction'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from private.chat_messages
    where id = p_message_id
      and conversation_id = p_conversation_id
      and deleted_at is null
  ) then
    raise exception 'chat_message_not_found'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from private.chat_message_reactions
    where message_id = p_message_id
      and user_id = p_actor_user_id
      and emoji = v_emoji
  ) then
    delete from private.chat_message_reactions
    where message_id = p_message_id
      and user_id = p_actor_user_id
      and emoji = v_emoji;
  else
    insert into private.chat_message_reactions (
      message_id,
      user_id,
      emoji
    )
    values (
      p_message_id,
      p_actor_user_id,
      v_emoji
    );
  end if;

  return (
    select private.chat_message_json(m)
    from private.chat_messages m
    where m.id = p_message_id
  );
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
        wm.user_id,
        coalesce(wu.display_name, u.display_name, u.handle, '') as display_name,
        case
          when v_query is null then 10
          when coalesce(wu.display_name, u.display_name, u.handle, '') ilike v_query || '%' then 0
          when coalesce(wu.display_name, u.display_name, u.handle, '') ilike '%' || v_query || '%' then 1
          else 2
        end as rank
      from public.workspace_members wm
      join public.users u on u.id = wm.user_id
      left join lateral (
        select workspace_users.display_name
        from public.workspace_user_linked_users wul
        join public.workspace_users
          on workspace_users.id = wul.virtual_user_id
         and workspace_users.ws_id = wul.ws_id
        where wul.ws_id = p_ws_id
          and wul.platform_user_id = wm.user_id
          and workspace_users.archived = false
        order by workspace_users.updated_at desc
        limit 1
      ) wu on true
      where wm.ws_id = p_ws_id
        and wm.user_id <> p_actor_user_id
        and (
          v_query is null
          or coalesce(wu.display_name, u.display_name, u.handle, '') ilike '%' || v_query || '%'
        )
      order by rank, display_name
      limit v_limit
    ) ranked
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
     and c.ws_id = p_ws_id
     and c.archived_at is null
    where m.deleted_at is null
      and m.content ilike '%' || v_query || '%'
      and private.chat_actor_can_access_conversation(c.id, p_actor_user_id)
    limit v_limit
  );
end;
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
  v_filename text := btrim(coalesce(p_filename, ''));
begin
  perform private.chat_assert_workspace_permission(
    p_ws_id,
    p_actor_user_id,
    'view_chat'
  );

  if private.chat_get_conversation(
    p_ws_id,
    p_conversation_id,
    p_actor_user_id
  ) is null then
    return null;
  end if;

  if char_length(v_filename) = 0 or char_length(v_filename) > 255 then
    raise exception 'chat_invalid_attachment_filename'
      using errcode = '22023';
  end if;

  if p_size_bytes is not null and (p_size_bytes < 0 or p_size_bytes > 104857600) then
    raise exception 'chat_attachment_too_large'
      using errcode = '22023';
  end if;

  return jsonb_build_object(
    'conversationId', p_conversation_id,
    'pathPrefix', format('chats/%s', p_conversation_id),
    'maxSizeBytes', 104857600
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
  v_storage_path text := p_payload->>'path';
  v_full_path text := p_payload->>'fullPath';
  v_size_bytes bigint := nullif(p_payload->>'sizeBytes', '')::bigint;
begin
  perform private.chat_prepare_attachment(
    p_ws_id,
    p_conversation_id,
    p_actor_user_id,
    coalesce(p_payload->>'filename', 'attachment'),
    v_size_bytes
  );

  if v_storage_path is null or not starts_with(
    v_storage_path,
    format('chats/%s/', p_conversation_id)
  ) then
    raise exception 'chat_attachment_path_forbidden'
      using errcode = '42501';
  end if;

  if v_full_path is not null and not starts_with(
    v_full_path,
    format('%s/chats/%s/', p_ws_id, p_conversation_id)
  ) then
    raise exception 'chat_attachment_full_path_forbidden'
      using errcode = '42501';
  end if;

  insert into private.chat_message_attachments (
    conversation_id,
    uploader_id,
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
  perform private.chat_assert_workspace_permission(
    p_ws_id,
    p_actor_user_id,
    'view_chat'
  );

  if not private.chat_actor_can_access_conversation(
    p_conversation_id,
    p_actor_user_id
  ) then
    raise exception 'chat_conversation_forbidden'
      using errcode = '42501';
  end if;

  select a.*
  into v_attachment
  from private.chat_message_attachments a
  join private.chat_conversations c
    on c.id = a.conversation_id
   and c.ws_id = p_ws_id
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
  v_message jsonb;
begin
  if not public.has_workspace_permission(
    p_ws_id,
    p_actor_user_id,
    'manage_chat'
  ) then
    raise exception 'chat_manage_permission_required'
      using errcode = '42501';
  end if;

  v_message := private.chat_send_message(
    p_ws_id,
    p_conversation_id,
    p_actor_user_id,
    p_content,
    null,
    '[]'::jsonb,
    'assistant'
  );

  update private.chat_messages
  set metadata = coalesce(p_metadata, '{}'::jsonb)
  where id = (v_message->>'id')::uuid;

  return (
    select private.chat_message_json(m)
    from private.chat_messages m
    where m.id = (v_message->>'id')::uuid
  );
end;
$$;

insert into public.workspace_default_permissions
  (ws_id, permission, member_type, enabled)
select
  w.id,
  p.permission,
  'MEMBER'::public.workspace_member_type,
  true
from
  public.workspaces w
  cross join (
    values
      ('view_chat'::public.workspace_role_permission),
      ('create_chat'::public.workspace_role_permission)
  ) as p(permission)
on conflict (ws_id, permission, member_type) do update
set enabled = excluded.enabled;

create or replace function public.initialize_workspace_admin_permission()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.workspace_default_permissions
    (ws_id, permission, member_type, enabled)
  values
    (new.id, 'admin', 'MEMBER', true),
    (new.id, 'view_drive', 'MEMBER', true),
    (new.id, 'manage_drive_tasks_directory', 'MEMBER', true),
    (new.id, 'view_chat', 'MEMBER', true),
    (new.id, 'create_chat', 'MEMBER', true)
  on conflict (ws_id, permission, member_type) do update
  set enabled = excluded.enabled;

  return new;
end;
$$;

comment on function public.initialize_workspace_admin_permission() is
  'Initializes MEMBER default permissions for newly created workspaces.';

do $$
begin
  if to_regclass('public.workspace_chat_channels') is not null then
    insert into private.chat_conversations (
      id,
      ws_id,
      type,
      title,
      description,
      ai_enabled,
      metadata,
      created_by,
      created_at,
      updated_at
    )
    select
      c.id,
      c.ws_id,
      'channel',
      c.name,
      c.description,
      false,
      jsonb_build_object('legacyPrivate', coalesce(c.is_private, false)),
      c.created_by,
      coalesce(c.created_at, now()),
      coalesce(c.updated_at, c.created_at, now())
    from public.workspace_chat_channels c
    on conflict (id) do nothing;
  end if;

  if to_regclass('public.workspace_chat_participants') is not null then
    insert into private.chat_conversation_members (
      conversation_id,
      user_id,
      role,
      joined_at,
      last_read_at
    )
    select
      p.channel_id,
      p.user_id,
      'member',
      coalesce(p.joined_at, now()),
      p.last_read_at
    from public.workspace_chat_participants p
    where exists (
      select 1
      from private.chat_conversations c
      where c.id = p.channel_id
    )
    on conflict (conversation_id, user_id) do nothing;
  end if;

  if to_regclass('public.workspace_chat_messages') is not null then
    insert into private.chat_messages (
      id,
      conversation_id,
      sender_id,
      kind,
      content,
      created_at,
      updated_at,
      deleted_at
    )
    select
      m.id,
      m.channel_id,
      m.user_id,
      'user',
      m.content,
      coalesce(m.created_at, now()),
      m.updated_at,
      m.deleted_at
    from public.workspace_chat_messages m
    where exists (
      select 1
      from private.chat_conversations c
      where c.id = m.channel_id
    )
    on conflict (id) do nothing;
  end if;
end $$;

revoke all on function private.chat_set_updated_at() from public, anon, authenticated;
revoke all on function private.chat_assert_workspace_permission(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.chat_assert_workspace_member(uuid, uuid) from public, anon, authenticated;
revoke all on function private.chat_actor_can_access_conversation(uuid, uuid) from public, anon, authenticated;
revoke all on function private.chat_member_profile_json(uuid, uuid) from public, anon, authenticated;
revoke all on function private.chat_attachment_json(private.chat_message_attachments) from public, anon, authenticated;
revoke all on function private.chat_message_json(private.chat_messages) from public, anon, authenticated;
revoke all on function private.chat_conversation_json(uuid, uuid) from public, anon, authenticated;
revoke all on function private.chat_list_conversations(uuid, uuid) from public, anon, authenticated;
revoke all on function private.chat_get_conversation(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.chat_create_conversation(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function private.chat_list_messages(uuid, uuid, uuid, integer, timestamptz) from public, anon, authenticated;
revoke all on function private.chat_send_message(uuid, uuid, uuid, text, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function private.chat_edit_message(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.chat_delete_message(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.chat_set_read_state(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.chat_toggle_reaction(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.chat_search_directory(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function private.chat_search_messages(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function private.chat_prepare_attachment(uuid, uuid, uuid, text, bigint) from public, anon, authenticated;
revoke all on function private.chat_finalize_attachment(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function private.chat_get_attachment(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.chat_persist_ai_message(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;

grant execute on function private.chat_set_updated_at() to service_role;
grant execute on function private.chat_assert_workspace_permission(uuid, uuid, text) to service_role;
grant execute on function private.chat_assert_workspace_member(uuid, uuid) to service_role;
grant execute on function private.chat_actor_can_access_conversation(uuid, uuid) to service_role;
grant execute on function private.chat_member_profile_json(uuid, uuid) to service_role;
grant execute on function private.chat_attachment_json(private.chat_message_attachments) to service_role;
grant execute on function private.chat_message_json(private.chat_messages) to service_role;
grant execute on function private.chat_conversation_json(uuid, uuid) to service_role;
grant execute on function private.chat_list_conversations(uuid, uuid) to service_role;
grant execute on function private.chat_get_conversation(uuid, uuid, uuid) to service_role;
grant execute on function private.chat_create_conversation(uuid, uuid, jsonb) to service_role;
grant execute on function private.chat_list_messages(uuid, uuid, uuid, integer, timestamptz) to service_role;
grant execute on function private.chat_send_message(uuid, uuid, uuid, text, uuid, jsonb, text) to service_role;
grant execute on function private.chat_edit_message(uuid, uuid, uuid, uuid, text) to service_role;
grant execute on function private.chat_delete_message(uuid, uuid, uuid, uuid) to service_role;
grant execute on function private.chat_set_read_state(uuid, uuid, uuid, uuid) to service_role;
grant execute on function private.chat_toggle_reaction(uuid, uuid, uuid, uuid, text) to service_role;
grant execute on function private.chat_search_directory(uuid, uuid, text, integer) to service_role;
grant execute on function private.chat_search_messages(uuid, uuid, text, integer) to service_role;
grant execute on function private.chat_prepare_attachment(uuid, uuid, uuid, text, bigint) to service_role;
grant execute on function private.chat_finalize_attachment(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function private.chat_get_attachment(uuid, uuid, uuid, uuid) to service_role;
grant execute on function private.chat_persist_ai_message(uuid, uuid, uuid, text, jsonb) to service_role;
