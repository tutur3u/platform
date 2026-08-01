-- Generic, binding-scoped external chat synchronization. Connector-specific
-- observations belong in JSON metadata so the open schema does not advertise
-- which installations may collect sensitive visitor context.

alter table private.chat_conversations
  add constraint chat_conversations_id_ws_key unique (id, ws_id);

create table private.external_chat_binding_credentials (
  ws_id uuid primary key references public.workspace_external_project_bindings(ws_id) on delete cascade,
  ingest_secret_hash text,
  ingest_secret_last_four text,
  ingest_secret_rotated_at timestamptz,
  control_secret_encrypted text,
  control_secret_last_four text,
  control_secret_rotated_at timestamptz,
  verified_at timestamptz,
  pending_action text,
  pending_secret_encrypted text,
  pending_secret_hash text,
  pending_secret_last_four text,
  pending_created_at timestamptz,
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
  ),
  constraint external_chat_pending_action_check check (
    pending_action is null or pending_action in ('set_ingest', 'rotate_control')
  )
);

create table private.external_chat_threads (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspace_external_project_bindings(ws_id) on delete cascade,
  connector_key text not null,
  remote_agent_id text not null default '',
  remote_visitor_id text not null,
  conversation_id uuid not null,
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
    unique (ws_id, conversation_id),
  constraint external_chat_threads_id_scope_key
    unique (id, ws_id, connector_key),
  constraint external_chat_threads_id_workspace_key
    unique (id, ws_id),
  constraint external_chat_threads_conversation_scope_fk
    foreign key (conversation_id, ws_id)
    references private.chat_conversations(id, ws_id) on delete cascade
);

create table private.external_chat_events (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspace_external_project_bindings(ws_id) on delete cascade,
  thread_id uuid not null,
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
  constraint external_chat_events_message_key unique (message_id),
  constraint external_chat_events_thread_scope_fk
    foreign key (thread_id, ws_id, connector_key)
    references private.external_chat_threads(id, ws_id, connector_key) on delete cascade
);

create table private.external_chat_outbound_deliveries (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspace_external_project_bindings(ws_id) on delete cascade,
  thread_id uuid not null,
  request_fingerprint text not null,
  idempotency_key uuid not null default gen_random_uuid(),
  message_id uuid references private.chat_messages(id) on delete cascade,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint external_chat_outbound_fingerprint_key unique (ws_id, request_fingerprint),
  constraint external_chat_outbound_idempotency_key unique (ws_id, idempotency_key),
  constraint external_chat_outbound_thread_scope_fk
    foreign key (thread_id, ws_id)
    references private.external_chat_threads(id, ws_id) on delete cascade
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
alter table private.external_chat_outbound_deliveries enable row level security;
alter table private.external_chat_sync_checkpoints enable row level security;

revoke all on table private.external_chat_binding_credentials from public, anon, authenticated;
revoke all on table private.external_chat_threads from public, anon, authenticated;
revoke all on table private.external_chat_events from public, anon, authenticated;
revoke all on table private.external_chat_outbound_deliveries from public, anon, authenticated;
revoke all on table private.external_chat_sync_checkpoints from public, anon, authenticated;
grant all on table private.external_chat_binding_credentials to service_role;
grant all on table private.external_chat_threads to service_role;
grant all on table private.external_chat_events to service_role;
grant all on table private.external_chat_outbound_deliveries to service_role;
grant all on table private.external_chat_sync_checkpoints to service_role;

create or replace function private.external_chat_update_settings(
  p_ws_id uuid,
  p_chat jsonb,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_previous_url text;
begin
  if jsonb_typeof(p_chat) <> 'object' then
    raise exception 'external_chat_invalid_settings';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_ws_id::text, 0));
  select settings #>> '{chat,bridgeBaseUrl}' into v_previous_url
  from public.workspace_external_project_bindings
  where ws_id = p_ws_id for update;
  if not found then raise exception 'external_chat_binding_not_found'; end if;

  if v_previous_url is distinct from p_chat->>'bridgeBaseUrl' then
    update private.external_chat_binding_credentials
    set verified_at = null where ws_id = p_ws_id;
  end if;
  update public.workspace_external_project_bindings
  set settings = jsonb_set(settings, '{chat}', p_chat, true),
      updated_by = p_actor_user_id
  where ws_id = p_ws_id;
end;
$$;

revoke all on function private.external_chat_update_settings(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function private.external_chat_update_settings(uuid, jsonb, uuid) to service_role;

create or replace function private.external_chat_stage_credential(
  p_ws_id uuid,
  p_action text,
  p_secret_encrypted text,
  p_secret_hash text,
  p_last_four text
)
returns void
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_pending_action text;
begin
  if p_action not in ('set_ingest', 'rotate_control') then
    raise exception 'external_chat_invalid_credential_action';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':', p_ws_id, 'credential'), 0));
  insert into private.external_chat_binding_credentials (ws_id)
  values (p_ws_id) on conflict (ws_id) do nothing;
  select pending_action into v_pending_action
  from private.external_chat_binding_credentials
  where ws_id = p_ws_id for update;
  if v_pending_action is not null then
    raise exception 'external_chat_credential_reconciliation_pending';
  end if;
  update private.external_chat_binding_credentials
  set pending_action = p_action,
      pending_secret_encrypted = p_secret_encrypted,
      pending_secret_hash = p_secret_hash,
      pending_secret_last_four = p_last_four,
      pending_created_at = now()
  where ws_id = p_ws_id;
end;
$$;

create or replace function private.external_chat_promote_credential(
  p_ws_id uuid,
  p_action text,
  p_secret_encrypted text
)
returns void
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_credentials private.external_chat_binding_credentials%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':', p_ws_id, 'credential'), 0));
  select * into v_credentials
  from private.external_chat_binding_credentials
  where ws_id = p_ws_id for update;
  if v_credentials.pending_action is distinct from p_action
    or v_credentials.pending_secret_encrypted is distinct from p_secret_encrypted then
    raise exception 'external_chat_pending_credential_changed';
  end if;

  update private.external_chat_binding_credentials
  set ingest_secret_hash = case when p_action = 'set_ingest' then pending_secret_hash else ingest_secret_hash end,
      ingest_secret_last_four = case when p_action = 'set_ingest' then pending_secret_last_four else ingest_secret_last_four end,
      ingest_secret_rotated_at = case when p_action = 'set_ingest' then now() else ingest_secret_rotated_at end,
      control_secret_encrypted = case when p_action = 'rotate_control' then pending_secret_encrypted else control_secret_encrypted end,
      control_secret_last_four = case when p_action = 'rotate_control' then pending_secret_last_four else control_secret_last_four end,
      control_secret_rotated_at = case when p_action = 'rotate_control' then now() else control_secret_rotated_at end,
      pending_action = null,
      pending_secret_encrypted = null,
      pending_secret_hash = null,
      pending_secret_last_four = null,
      pending_created_at = null,
      verified_at = null
  where ws_id = p_ws_id;
end;
$$;

revoke all on function private.external_chat_stage_credential(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function private.external_chat_promote_credential(uuid, text, text) from public, anon, authenticated;
grant execute on function private.external_chat_stage_credential(uuid, text, text, text, text) to service_role;
grant execute on function private.external_chat_promote_credential(uuid, text, text) to service_role;

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

  if jsonb_typeof(coalesce(p_thread_metadata, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_message_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'external_chat_invalid_metadata';
  end if;

  if not exists (
    select 1 from public.workspace_external_project_bindings b
    where b.ws_id = p_ws_id
      and b.is_enabled = true
      and b.settings #>> '{chat,enabled}' = 'true'
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
      coalesce(p_thread_metadata, '{}'::jsonb) || jsonb_build_object('externalChat', true),
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
    coalesce(p_message_metadata, '{}'::jsonb) || jsonb_build_object(
      'externalChat', true,
      'externalSender', jsonb_build_object('direction', p_direction),
      'remoteMessageId', p_remote_message_id
    ),
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

create or replace function private.external_chat_reserve_reply(
  p_ws_id uuid,
  p_conversation_id uuid,
  p_actor_user_id uuid,
  p_request_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_delivery private.external_chat_outbound_deliveries%rowtype;
  v_thread private.external_chat_threads%rowtype;
begin
  perform private.chat_assert_workspace_permission(p_ws_id, p_actor_user_id, 'create_chat');
  if not private.chat_actor_can_access_conversation(p_conversation_id, p_actor_user_id) then
    raise exception 'chat_conversation_forbidden' using errcode = '42501';
  end if;

  select * into v_thread from private.external_chat_threads
  where ws_id = p_ws_id and conversation_id = p_conversation_id;
  if v_thread.id is null then return null; end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':', p_ws_id, p_request_fingerprint), 0));
  select * into v_delivery from private.external_chat_outbound_deliveries
  where ws_id = p_ws_id and request_fingerprint = p_request_fingerprint;

  if v_delivery.id is not null and (
    v_delivery.message_id is null or v_delivery.completed_at > now() - interval '5 minutes'
  ) then
    return jsonb_build_object(
      'deliveryId', v_delivery.id,
      'delivered', v_delivery.delivered_at is not null,
      'idempotencyKey', v_delivery.idempotency_key,
      'messageId', v_delivery.message_id,
      'threadId', v_delivery.thread_id
    );
  end if;

  delete from private.external_chat_outbound_deliveries
  where ws_id = p_ws_id and request_fingerprint = p_request_fingerprint;
  insert into private.external_chat_outbound_deliveries (
    ws_id, thread_id, request_fingerprint
  ) values (p_ws_id, v_thread.id, p_request_fingerprint)
  returning * into v_delivery;

  return jsonb_build_object(
    'deliveryId', v_delivery.id,
    'delivered', false,
    'idempotencyKey', v_delivery.idempotency_key,
    'messageId', null,
    'threadId', v_delivery.thread_id
  );
end;
$$;

create or replace function private.external_chat_finalize_reply(
  p_ws_id uuid,
  p_delivery_id uuid,
  p_actor_user_id uuid,
  p_content text,
  p_reply_to_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_delivery private.external_chat_outbound_deliveries%rowtype;
  v_message jsonb;
  v_message_id uuid;
begin
  select * into v_delivery from private.external_chat_outbound_deliveries
  where id = p_delivery_id and ws_id = p_ws_id for update;
  if v_delivery.id is null then raise exception 'external_chat_delivery_not_found'; end if;
  if v_delivery.message_id is not null then
    return (select private.chat_message_json(m) from private.chat_messages m where m.id = v_delivery.message_id);
  end if;
  if v_delivery.delivered_at is null then raise exception 'external_chat_delivery_unconfirmed'; end if;

  v_message := private.chat_send_message(
    p_ws_id, (select conversation_id from private.external_chat_threads where id = v_delivery.thread_id),
    p_actor_user_id, p_content, p_reply_to_message_id, '[]'::jsonb, 'user'
  );
  if v_message is null then raise exception 'chat_conversation_not_found'; end if;
  v_message_id := (v_message->>'id')::uuid;
  insert into private.external_chat_events (
    ws_id, thread_id, connector_key, remote_message_id, message_id, direction, metadata
  ) select p_ws_id, t.id, t.connector_key, v_delivery.idempotency_key::text,
    v_message_id, 'staff', jsonb_build_object('deliveredBy', 'control', 'nativeOrigin', true)
  from private.external_chat_threads t where t.id = v_delivery.thread_id;
  update private.external_chat_outbound_deliveries
  set message_id = v_message_id, completed_at = now() where id = v_delivery.id;
  return v_message;
end;
$$;

revoke all on function private.external_chat_reserve_reply(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.external_chat_finalize_reply(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function private.external_chat_reserve_reply(uuid, uuid, uuid, text) to service_role;
grant execute on function private.external_chat_finalize_reply(uuid, uuid, uuid, text, uuid) to service_role;
