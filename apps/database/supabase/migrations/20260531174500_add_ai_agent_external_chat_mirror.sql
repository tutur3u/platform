create schema if not exists private;

create table if not exists private.ai_agent_external_threads (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id text not null,
  channel_id text not null,
  adapter text not null,
  external_thread_id text not null,
  external_channel_id text,
  title text,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_agent_external_threads_adapter_check check (
    adapter in ('discord', 'zalo')
  ),
  constraint ai_agent_external_threads_agent_id_check check (
    char_length(agent_id) between 1 and 80
  ),
  constraint ai_agent_external_threads_channel_id_check check (
    char_length(channel_id) between 1 and 80
  ),
  constraint ai_agent_external_threads_external_thread_id_check check (
    char_length(external_thread_id) between 1 and 512
  ),
  unique (agent_id, channel_id, external_thread_id)
);

create index if not exists ai_agent_external_threads_ws_event_idx
  on private.ai_agent_external_threads (ws_id, last_event_at desc, updated_at desc);

create index if not exists ai_agent_external_threads_channel_idx
  on private.ai_agent_external_threads (agent_id, channel_id, updated_at desc);

create table if not exists private.ai_agent_external_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references private.ai_agent_external_threads(id) on delete cascade,
  external_message_id text not null,
  direction text not null,
  kind text not null default 'user',
  content text not null default '',
  author_external_id text,
  author_display_name text,
  author_avatar_url text,
  platform_user_id uuid references public.users(id) on delete set null,
  raw jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  external_created_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_agent_external_messages_direction_check check (
    direction in ('inbound', 'outbound')
  ),
  constraint ai_agent_external_messages_kind_check check (
    kind in ('user', 'assistant', 'system')
  ),
  constraint ai_agent_external_messages_content_check check (
    char_length(content) <= 40000
  ),
  constraint ai_agent_external_messages_external_id_check check (
    char_length(external_message_id) between 1 and 512
  ),
  unique (thread_id, external_message_id)
);

create index if not exists ai_agent_external_messages_thread_created_idx
  on private.ai_agent_external_messages (thread_id, external_created_at desc);

alter table private.ai_agent_external_threads enable row level security;
alter table private.ai_agent_external_messages enable row level security;

revoke all on table private.ai_agent_external_threads from public, anon, authenticated;
revoke all on table private.ai_agent_external_messages from public, anon, authenticated;

grant all on table private.ai_agent_external_threads to service_role;
grant all on table private.ai_agent_external_messages to service_role;

drop trigger if exists ai_agent_external_threads_set_updated_at
  on private.ai_agent_external_threads;
create trigger ai_agent_external_threads_set_updated_at
  before update on private.ai_agent_external_threads
  for each row execute function private.chat_set_updated_at();

drop trigger if exists ai_agent_external_messages_set_updated_at
  on private.ai_agent_external_messages;
create trigger ai_agent_external_messages_set_updated_at
  before update on private.ai_agent_external_messages
  for each row execute function private.chat_set_updated_at();

create or replace function private.ai_agent_external_conversation_id(
  p_thread_id uuid
)
returns text
language sql
immutable
security definer
set search_path = private, public, pg_temp
as $$
  select 'ai-agent-thread-' || p_thread_id::text;
$$;

create or replace function private.ai_agent_external_message_json(
  p_message private.ai_agent_external_messages
)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select jsonb_build_object(
    'attachments', '[]'::jsonb,
    'content', p_message.content,
    'conversationId', private.ai_agent_external_conversation_id(p_message.thread_id),
    'createdAt', p_message.external_created_at,
    'deletedAt', null,
    'editedAt', null,
    'id', p_message.id,
    'kind', p_message.kind,
    'metadata', p_message.metadata || jsonb_build_object(
      'direction', p_message.direction,
      'externalMessageId', p_message.external_message_id,
      'source', 'ai-agent-external-thread'
    ),
    'reactions', '[]'::jsonb,
    'replyToMessageId', null,
    'sender', case
      when p_message.author_display_name is null
        and p_message.author_external_id is null
      then null
      else jsonb_build_object(
        'avatarUrl', p_message.author_avatar_url,
        'displayName', coalesce(
          p_message.author_display_name,
          p_message.author_external_id,
          'External user'
        ),
        'handle', p_message.author_external_id,
        'id', coalesce(
          p_message.platform_user_id::text,
          p_message.author_external_id,
          p_message.id::text
        )
      )
    end,
    'senderId', p_message.platform_user_id,
    'updatedAt', p_message.updated_at
  );
$$;

create or replace function private.ai_agent_external_thread_json(
  p_thread private.ai_agent_external_threads
)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with latest_message as (
    select private.ai_agent_external_message_json(m.*) as value
    from private.ai_agent_external_messages m
    where m.thread_id = p_thread.id
    order by m.external_created_at desc, m.created_at desc
    limit 1
  ),
  message_count as (
    select count(*)::integer as value
    from private.ai_agent_external_messages m
    where m.thread_id = p_thread.id
  )
  select jsonb_build_object(
    'adapter', p_thread.adapter,
    'agentId', p_thread.agent_id,
    'channelId', p_thread.channel_id,
    'conversationId', private.ai_agent_external_conversation_id(p_thread.id),
    'createdAt', p_thread.created_at,
    'externalChannelId', p_thread.external_channel_id,
    'externalThreadId', p_thread.external_thread_id,
    'id', p_thread.id,
    'lastEventAt', p_thread.last_event_at,
    'lastSyncedAt', p_thread.last_synced_at,
    'latestMessage', (select value from latest_message),
    'messageCount', (select value from message_count),
    'metadata', p_thread.metadata,
    'title', p_thread.title,
    'updatedAt', p_thread.updated_at,
    'wsId', p_thread.ws_id
  );
$$;

create or replace function private.ai_agent_external_thread_conversation_json(
  p_thread private.ai_agent_external_threads
)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with latest_message as (
    select private.ai_agent_external_message_json(m.*) as value
    from private.ai_agent_external_messages m
    where m.thread_id = p_thread.id
    order by m.external_created_at desc, m.created_at desc
    limit 1
  ),
  message_count as (
    select count(*)::integer as value
    from private.ai_agent_external_messages m
    where m.thread_id = p_thread.id
  )
  select jsonb_build_object(
    'aiEnabled', true,
    'archivedAt', null,
    'createdAt', p_thread.created_at,
    'createdBy', null,
    'description', p_thread.adapter || ' external thread ' || p_thread.external_thread_id,
    'id', private.ai_agent_external_conversation_id(p_thread.id),
    'latestMessage', (select value from latest_message),
    'memberCount', 0,
    'members', '[]'::jsonb,
    'metadata', p_thread.metadata || jsonb_build_object(
      'adapter', p_thread.adapter,
      'agentId', p_thread.agent_id,
      'channelId', p_thread.channel_id,
      'externalChannelId', p_thread.external_channel_id,
      'externalThreadId', p_thread.external_thread_id,
      'externalThreadUuid', p_thread.id,
      'messageCount', (select value from message_count),
      'readOnly', true,
      'source', 'ai-agent-external-thread'
    ),
    'title', coalesce(
      p_thread.title,
      p_thread.metadata->>'channelDisplayName',
      p_thread.adapter || ' thread'
    ),
    'type', 'ai',
    'unreadCount', 0,
    'updatedAt', coalesce(p_thread.last_event_at, p_thread.updated_at, p_thread.created_at),
    'wsId', p_thread.ws_id
  );
$$;

create or replace function private.ai_agent_external_upsert_thread(
  p_ws_id uuid,
  p_agent_id text,
  p_channel_id text,
  p_adapter text,
  p_external_thread_id text,
  p_external_channel_id text default null,
  p_title text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_thread private.ai_agent_external_threads;
begin
  if p_adapter not in ('discord', 'zalo') then
    raise exception 'invalid_ai_agent_external_adapter'
      using errcode = '22023';
  end if;

  insert into private.ai_agent_external_threads (
    ws_id,
    agent_id,
    channel_id,
    adapter,
    external_thread_id,
    external_channel_id,
    title,
    metadata,
    last_event_at
  )
  values (
    p_ws_id,
    p_agent_id,
    p_channel_id,
    p_adapter,
    p_external_thread_id,
    nullif(p_external_channel_id, ''),
    nullif(p_title, ''),
    coalesce(p_metadata, '{}'::jsonb),
    now()
  )
  on conflict (agent_id, channel_id, external_thread_id)
  do update set
    ws_id = excluded.ws_id,
    adapter = excluded.adapter,
    external_channel_id = excluded.external_channel_id,
    title = coalesce(excluded.title, private.ai_agent_external_threads.title),
    metadata = private.ai_agent_external_threads.metadata || excluded.metadata,
    last_event_at = coalesce(
      private.ai_agent_external_threads.last_event_at,
      excluded.last_event_at
    )
  returning * into v_thread;

  return private.ai_agent_external_thread_json(v_thread);
end;
$$;

create or replace function private.ai_agent_external_upsert_message(
  p_thread_id uuid,
  p_external_message_id text,
  p_direction text,
  p_kind text,
  p_content text,
  p_author_external_id text default null,
  p_author_display_name text default null,
  p_author_avatar_url text default null,
  p_platform_user_id uuid default null,
  p_raw jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_external_created_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_message private.ai_agent_external_messages;
begin
  if p_direction not in ('inbound', 'outbound') then
    raise exception 'invalid_ai_agent_external_message_direction'
      using errcode = '22023';
  end if;

  if p_kind not in ('user', 'assistant', 'system') then
    raise exception 'invalid_ai_agent_external_message_kind'
      using errcode = '22023';
  end if;

  insert into private.ai_agent_external_messages (
    thread_id,
    external_message_id,
    direction,
    kind,
    content,
    author_external_id,
    author_display_name,
    author_avatar_url,
    platform_user_id,
    raw,
    metadata,
    external_created_at
  )
  values (
    p_thread_id,
    p_external_message_id,
    p_direction,
    p_kind,
    coalesce(p_content, ''),
    nullif(p_author_external_id, ''),
    nullif(p_author_display_name, ''),
    nullif(p_author_avatar_url, ''),
    p_platform_user_id,
    coalesce(p_raw, '{}'::jsonb),
    coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_external_created_at, now())
  )
  on conflict (thread_id, external_message_id)
  do update set
    direction = excluded.direction,
    kind = excluded.kind,
    content = excluded.content,
    author_external_id = excluded.author_external_id,
    author_display_name = excluded.author_display_name,
    author_avatar_url = excluded.author_avatar_url,
    platform_user_id = excluded.platform_user_id,
    raw = excluded.raw,
    metadata = private.ai_agent_external_messages.metadata || excluded.metadata,
    external_created_at = excluded.external_created_at
  returning * into v_message;

  update private.ai_agent_external_threads
  set last_event_at = greatest(
      coalesce(last_event_at, v_message.external_created_at),
      v_message.external_created_at
    )
  where id = p_thread_id;

  return private.ai_agent_external_message_json(v_message);
end;
$$;

create or replace function private.ai_agent_external_list_threads(
  p_agent_id text default null,
  p_channel_id text default null,
  p_ws_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      private.ai_agent_external_thread_json(t.*)
      order by coalesce(t.last_event_at, t.updated_at, t.created_at) desc
    ),
    '[]'::jsonb
  )
  from private.ai_agent_external_threads t
  where (p_agent_id is null or t.agent_id = p_agent_id)
    and (p_channel_id is null or t.channel_id = p_channel_id)
    and (p_ws_id is null or t.ws_id = p_ws_id);
$$;

create or replace function private.ai_agent_external_get_thread(
  p_thread_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select private.ai_agent_external_thread_json(t.*)
  from private.ai_agent_external_threads t
  where t.id = p_thread_id;
$$;

create or replace function private.ai_agent_external_mark_thread_synced(
  p_thread_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_thread private.ai_agent_external_threads;
begin
  update private.ai_agent_external_threads
  set last_synced_at = now()
  where id = p_thread_id
  returning * into v_thread;

  if v_thread.id is null then
    raise exception 'ai_agent_external_thread_not_found'
      using errcode = 'P0002';
  end if;

  return private.ai_agent_external_thread_json(v_thread);
end;
$$;

create or replace function private.ai_agent_external_list_conversations(
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
        private.ai_agent_external_thread_conversation_json(t.*)
        order by coalesce(t.last_event_at, t.updated_at, t.created_at) desc
      ),
      '[]'::jsonb
    )
    from private.ai_agent_external_threads t
    where t.ws_id = p_ws_id
  );
end;
$$;

create or replace function private.ai_agent_external_list_messages(
  p_ws_id uuid,
  p_actor_user_id uuid,
  p_conversation_id text,
  p_limit integer default 80,
  p_before timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_thread_id uuid;
begin
  perform private.chat_assert_workspace_permission(
    p_ws_id,
    p_actor_user_id,
    'view_chat'
  );

  v_thread_id := replace(p_conversation_id, 'ai-agent-thread-', '')::uuid;

  if not exists (
    select 1
    from private.ai_agent_external_threads t
    where t.id = v_thread_id
      and t.ws_id = p_ws_id
  ) then
    raise exception 'ai_agent_external_thread_not_found'
      using errcode = 'P0002';
  end if;

  return (
    with page as (
      select m.*
      from private.ai_agent_external_messages m
      where m.thread_id = v_thread_id
        and (p_before is null or m.external_created_at < p_before)
      order by m.external_created_at desc, m.created_at desc
      limit least(greatest(coalesce(p_limit, 80), 1), 100)
    )
    select coalesce(
      jsonb_agg(
        private.ai_agent_external_message_json(page.*)
        order by page.external_created_at asc, page.created_at asc
      ),
      '[]'::jsonb
    )
    from page
  );
end;
$$;

create or replace function private.ai_agent_external_list_thread_messages(
  p_thread_id uuid,
  p_limit integer default 80
)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with page as (
    select m.*
    from private.ai_agent_external_messages m
    where m.thread_id = p_thread_id
    order by m.external_created_at desc, m.created_at desc
    limit least(greatest(coalesce(p_limit, 80), 1), 100)
  )
  select coalesce(
    jsonb_agg(
      private.ai_agent_external_message_json(page.*)
      order by page.external_created_at asc, page.created_at asc
    ),
    '[]'::jsonb
  )
  from page;
$$;

revoke all on function private.ai_agent_external_conversation_id(uuid) from public, anon, authenticated;
revoke all on function private.ai_agent_external_message_json(private.ai_agent_external_messages) from public, anon, authenticated;
revoke all on function private.ai_agent_external_thread_json(private.ai_agent_external_threads) from public, anon, authenticated;
revoke all on function private.ai_agent_external_thread_conversation_json(private.ai_agent_external_threads) from public, anon, authenticated;
revoke all on function private.ai_agent_external_upsert_thread(uuid, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function private.ai_agent_external_upsert_message(uuid, text, text, text, text, text, text, text, uuid, jsonb, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function private.ai_agent_external_list_threads(text, text, uuid) from public, anon, authenticated;
revoke all on function private.ai_agent_external_get_thread(uuid) from public, anon, authenticated;
revoke all on function private.ai_agent_external_mark_thread_synced(uuid) from public, anon, authenticated;
revoke all on function private.ai_agent_external_list_conversations(uuid, uuid) from public, anon, authenticated;
revoke all on function private.ai_agent_external_list_messages(uuid, uuid, text, integer, timestamptz) from public, anon, authenticated;
revoke all on function private.ai_agent_external_list_thread_messages(uuid, integer) from public, anon, authenticated;

grant execute on function private.ai_agent_external_conversation_id(uuid) to service_role;
grant execute on function private.ai_agent_external_message_json(private.ai_agent_external_messages) to service_role;
grant execute on function private.ai_agent_external_thread_json(private.ai_agent_external_threads) to service_role;
grant execute on function private.ai_agent_external_thread_conversation_json(private.ai_agent_external_threads) to service_role;
grant execute on function private.ai_agent_external_upsert_thread(uuid, text, text, text, text, text, text, jsonb) to service_role;
grant execute on function private.ai_agent_external_upsert_message(uuid, text, text, text, text, text, text, text, uuid, jsonb, jsonb, timestamptz) to service_role;
grant execute on function private.ai_agent_external_list_threads(text, text, uuid) to service_role;
grant execute on function private.ai_agent_external_get_thread(uuid) to service_role;
grant execute on function private.ai_agent_external_mark_thread_synced(uuid) to service_role;
grant execute on function private.ai_agent_external_list_conversations(uuid, uuid) to service_role;
grant execute on function private.ai_agent_external_list_messages(uuid, uuid, text, integer, timestamptz) to service_role;
grant execute on function private.ai_agent_external_list_thread_messages(uuid, integer) to service_role;

notify pgrst, 'reload schema';
