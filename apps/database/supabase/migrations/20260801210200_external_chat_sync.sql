-- Generic, binding-scoped external chat synchronization. Connector-specific
-- observations belong in JSON metadata so the open schema does not advertise
-- which installations may collect sensitive visitor context.

create table private.external_chat_binding_credentials (
  ws_id uuid primary key references public.workspace_external_project_bindings(ws_id) on delete cascade,
  ingest_secret_hash text,
  ingest_secret_last_four text,
  ingest_secret_rotated_at timestamptz,
  control_secret_encrypted text,
  control_secret_last_four text,
  control_secret_rotated_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_chat_ingest_hash_length check (
    ingest_secret_hash is null or char_length(ingest_secret_hash) = 64
  ),
  constraint external_chat_ingest_last_four_length check (
    ingest_secret_last_four is null or char_length(ingest_secret_last_four) = 4
  ),
  constraint external_chat_control_last_four_length check (
    control_secret_last_four is null or char_length(control_secret_last_four) = 4
  )
);

create table private.external_chat_threads (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspace_external_project_bindings(ws_id) on delete cascade,
  connector_key text not null,
  remote_agent_id text not null default '',
  remote_visitor_id text not null,
  conversation_id uuid not null references private.chat_conversations(id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_chat_threads_connector_key_length check (
    char_length(connector_key) between 1 and 160
  ),
  constraint external_chat_threads_remote_visitor_length check (
    char_length(remote_visitor_id) between 1 and 255
  ),
  constraint external_chat_threads_remote_identity_key
    unique (ws_id, connector_key, remote_agent_id, remote_visitor_id),
  constraint external_chat_threads_conversation_key
    unique (ws_id, conversation_id)
);

create table private.external_chat_events (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspace_external_project_bindings(ws_id) on delete cascade,
  thread_id uuid not null references private.external_chat_threads(id) on delete cascade,
  connector_key text not null,
  remote_message_id text not null,
  message_id uuid not null references private.chat_messages(id) on delete cascade,
  direction text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint external_chat_events_direction_check check (
    direction in ('visitor', 'staff', 'system')
  ),
  constraint external_chat_events_remote_message_length check (
    char_length(remote_message_id) between 1 and 255
  ),
  constraint external_chat_events_remote_message_key
    unique (ws_id, connector_key, remote_message_id),
  constraint external_chat_events_message_key unique (message_id)
);

create table private.external_chat_sync_checkpoints (
  ws_id uuid primary key references public.workspace_external_project_bindings(ws_id) on delete cascade,
  state text not null default 'unconfigured',
  bridge_checked_at timestamptz,
  ingest_checked_at timestamptz,
  reconciled_at timestamptz,
  pending_count bigint not null default 0,
  details jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint external_chat_sync_state_check check (
    state in ('unconfigured', 'ready', 'degraded', 'paused')
  ),
  constraint external_chat_pending_count_check check (pending_count >= 0)
);

create index external_chat_threads_conversation_idx
  on private.external_chat_threads (conversation_id);
create index external_chat_events_thread_created_idx
  on private.external_chat_events (thread_id, created_at desc);

alter table private.external_chat_binding_credentials enable row level security;
alter table private.external_chat_threads enable row level security;
alter table private.external_chat_events enable row level security;
alter table private.external_chat_sync_checkpoints enable row level security;

revoke all on table private.external_chat_binding_credentials from public, anon, authenticated;
revoke all on table private.external_chat_threads from public, anon, authenticated;
revoke all on table private.external_chat_events from public, anon, authenticated;
revoke all on table private.external_chat_sync_checkpoints from public, anon, authenticated;
grant all on table private.external_chat_binding_credentials to service_role;
grant all on table private.external_chat_threads to service_role;
grant all on table private.external_chat_events to service_role;
grant all on table private.external_chat_sync_checkpoints to service_role;

create trigger external_chat_binding_credentials_updated_at
  before update on private.external_chat_binding_credentials
  for each row execute function private.chat_set_updated_at();
create trigger external_chat_threads_updated_at
  before update on private.external_chat_threads
  for each row execute function private.chat_set_updated_at();
create trigger external_chat_sync_checkpoints_updated_at
  before update on private.external_chat_sync_checkpoints
  for each row execute function private.chat_set_updated_at();

create or replace function private.external_chat_import_event(
  p_ws_id uuid,
  p_connector_key text,
  p_remote_agent_id text,
  p_remote_visitor_id text,
  p_remote_message_id text,
  p_direction text,
  p_content text,
  p_occurred_at timestamptz,
  p_thread_metadata jsonb default '{}'::jsonb,
  p_message_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_thread private.external_chat_threads%rowtype;
  v_conversation_id uuid;
  v_message_id uuid;
  v_existing_message_id uuid;
  v_title text;
begin
  if p_connector_key is null or btrim(p_connector_key) = ''
    or p_remote_visitor_id is null or btrim(p_remote_visitor_id) = ''
    or p_remote_message_id is null or btrim(p_remote_message_id) = '' then
    raise exception 'external_chat_invalid_identity';
  end if;

  if p_direction not in ('visitor', 'staff', 'system') then
    raise exception 'external_chat_invalid_direction';
  end if;

  if octet_length(coalesce(p_content, '')) > 40000 then
    raise exception 'external_chat_content_too_large';
  end if;

  if not exists (
    select 1 from public.workspace_external_project_bindings b
    where b.ws_id = p_ws_id and b.is_enabled = true
  ) then
    raise exception 'external_chat_binding_unavailable';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', p_ws_id, p_connector_key, coalesce(p_remote_agent_id, ''), p_remote_visitor_id),
    0
  ));

  select e.message_id into v_existing_message_id
  from private.external_chat_events e
  where e.ws_id = p_ws_id
    and e.connector_key = p_connector_key
    and e.remote_message_id = p_remote_message_id;

  if v_existing_message_id is not null then
    return jsonb_build_object(
      'duplicate', true,
      'messageId', v_existing_message_id
    );
  end if;

  select * into v_thread
  from private.external_chat_threads t
  where t.ws_id = p_ws_id
    and t.connector_key = p_connector_key
    and t.remote_agent_id = coalesce(p_remote_agent_id, '')
    and t.remote_visitor_id = p_remote_visitor_id;

  if v_thread.id is null then
    v_title := nullif(p_thread_metadata->>'displayName', '');
    insert into private.chat_conversations (
      ws_id, type, title, metadata, created_at, updated_at
    ) values (
      p_ws_id,
      'channel',
      coalesce(v_title, 'External visitor'),
      jsonb_build_object('externalChat', true) || coalesce(p_thread_metadata, '{}'::jsonb),
      coalesce(p_occurred_at, now()),
      coalesce(p_occurred_at, now())
    ) returning id into v_conversation_id;

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

  insert into private.chat_messages (
    conversation_id, sender_id, kind, content, metadata, created_at
  ) values (
    v_thread.conversation_id,
    null,
    case when p_direction = 'system' then 'system' else 'user' end,
    coalesce(p_content, ''),
    jsonb_build_object(
      'externalChat', true,
      'externalSender', p_direction,
      'remoteMessageId', p_remote_message_id
    ) || coalesce(p_message_metadata, '{}'::jsonb),
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

  update private.chat_conversations
  set updated_at = greatest(updated_at, coalesce(p_occurred_at, now()))
  where id = v_thread.conversation_id;

  return jsonb_build_object(
    'conversationId', v_thread.conversation_id,
    'duplicate', false,
    'messageId', v_message_id,
    'threadId', v_thread.id
  );
end;
$$;

revoke all on function private.external_chat_import_event(
  uuid, text, text, text, text, text, text, timestamptz, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function private.external_chat_import_event(
  uuid, text, text, text, text, text, text, timestamptz, jsonb, jsonb
) to service_role;
