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
  configuration_revision bigint not null default 1,
  verified_at timestamptz,
  verified_revision bigint,
  pending_action text,
  pending_secret_encrypted text,
  pending_secret_hash text,
  pending_secret_last_four text,
  pending_created_at timestamptz,
  pairing_ticket_hash text,
  pairing_ticket_issued_at timestamptz,
  pairing_ticket_expires_at timestamptz,
  pairing_ticket_consumed_at timestamptz,
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
  constraint external_chat_pairing_ticket_hash_length check (
    pairing_ticket_hash is null or char_length(pairing_ticket_hash) = 64
  ),
  constraint external_chat_pending_action_check check (
    pending_action is null or pending_action in (
      'set_ingest', 'rotate_control', 'clear_ingest', 'clear_control'
    )
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
  payload_hash text not null,
  configuration_revision bigint not null,
  idempotency_key uuid not null default gen_random_uuid(),
  actor_user_id uuid references public.users(id) on delete set null,
  reply_to_message_id uuid references private.chat_messages(id) on delete set null,
  message_id uuid references private.chat_messages(id) on delete cascade,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint external_chat_outbound_fingerprint_key unique (ws_id, request_fingerprint),
  constraint external_chat_outbound_payload_hash_length check (
    char_length(payload_hash) = 64
  ),
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
create unique index ai_chat_messages_persistence_request_key
  on public.ai_chat_messages (chat_id, role, (metadata->>'requestId'))
  where metadata->>'requestId' is not null
    and metadata->>'source' in ('Mira', 'Rewise');

create table private.ai_chat_persistence_requests (
  chat_id uuid not null references public.ai_chats(id) on delete cascade,
  request_id uuid not null,
  creator_id uuid not null references public.users(id) on delete cascade,
  source text not null,
  lease_token uuid not null,
  lease_expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (chat_id, request_id),
  constraint ai_chat_persistence_requests_source_check
    check (source in ('Mira', 'Rewise'))
);

alter table private.ai_chat_persistence_requests enable row level security;
revoke all on table private.ai_chat_persistence_requests
  from public, anon, authenticated;
grant all on table private.ai_chat_persistence_requests to service_role;

create or replace function private.ai_chat_claim_persistence_request(
  p_chat_id uuid,
  p_creator_id uuid,
  p_request_id uuid,
  p_content text,
  p_source text,
  p_lease_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_request private.ai_chat_persistence_requests%rowtype;
  v_user_message public.ai_chat_messages%rowtype;
  v_retry_after integer;
begin
  if p_chat_id is null or p_creator_id is null or p_request_id is null
    or p_lease_token is null or p_source not in ('Mira', 'Rewise') then
    raise exception 'ai_chat_persistence_claim_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', p_chat_id, p_request_id), 0
  ));

  if not exists (
    select 1 from public.ai_chats c
    where c.id = p_chat_id and c.creator_id = p_creator_id
  ) then
    raise exception 'ai_chat_persistence_chat_forbidden' using errcode = '42501';
  end if;

  select * into v_user_message
  from public.ai_chat_messages m
  where m.chat_id = p_chat_id
    and m.creator_id = p_creator_id
    and m.role = 'USER'
    and m.metadata->>'requestId' = p_request_id::text
    and m.metadata->>'source' = p_source
  limit 1;

  if v_user_message.id is null then
    raise exception 'ai_chat_persistence_user_message_missing'
      using errcode = '22023';
  end if;
  if v_user_message.content is distinct from p_content then
    raise exception 'ai_chat_persistence_payload_mismatch'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.ai_chat_messages m
    where m.chat_id = p_chat_id
      and m.role = 'ASSISTANT'
      and m.metadata->>'requestId' = p_request_id::text
      and m.metadata->>'source' = p_source
  ) then
    return jsonb_build_object('state', 'completed', 'retryAfterSeconds', 0);
  end if;

  select * into v_request
  from private.ai_chat_persistence_requests r
  where r.chat_id = p_chat_id and r.request_id = p_request_id
  for update;

  if v_request.chat_id is not null
    and v_request.completed_at is null
    and v_request.lease_expires_at > now()
    and v_request.lease_token is distinct from p_lease_token then
    v_retry_after := greatest(
      1,
      ceil(extract(epoch from (v_request.lease_expires_at - now())))::integer
    );
    return jsonb_build_object(
      'state', 'active',
      'retryAfterSeconds', v_retry_after
    );
  end if;

  insert into private.ai_chat_persistence_requests (
    chat_id, request_id, creator_id, source, lease_token, lease_expires_at
  ) values (
    p_chat_id, p_request_id, p_creator_id, p_source, p_lease_token,
    now() + interval '150 seconds'
  )
  on conflict (chat_id, request_id) do update
  set creator_id = excluded.creator_id,
      source = excluded.source,
      lease_token = excluded.lease_token,
      lease_expires_at = excluded.lease_expires_at,
      completed_at = null,
      updated_at = now();

  return jsonb_build_object('state', 'claimed', 'retryAfterSeconds', 0);
end;
$$;

create or replace function private.ai_chat_complete_persistence_request(
  p_chat_id uuid,
  p_request_id uuid,
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  if not exists (
    select 1
    from private.ai_chat_persistence_requests r
    join public.ai_chat_messages m
      on m.chat_id = r.chat_id
      and m.role = 'ASSISTANT'
      and m.metadata->>'requestId' = r.request_id::text
      and m.metadata->>'source' = r.source
    where r.chat_id = p_chat_id
      and r.request_id = p_request_id
      and r.lease_token = p_lease_token
  ) then
    return false;
  end if;

  update private.ai_chat_persistence_requests
  set completed_at = now(), lease_expires_at = now(), updated_at = now()
  where chat_id = p_chat_id
    and request_id = p_request_id
    and lease_token = p_lease_token;
  return found;
end;
$$;

create or replace function private.ai_chat_release_persistence_request(
  p_chat_id uuid,
  p_request_id uuid,
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  update private.ai_chat_persistence_requests
  set lease_expires_at = now(), updated_at = now()
  where chat_id = p_chat_id
    and request_id = p_request_id
    and lease_token = p_lease_token
    and completed_at is null;
  return found;
end;
$$;

revoke all on function private.ai_chat_claim_persistence_request(
  uuid, uuid, uuid, text, text, uuid
) from public, anon, authenticated;
grant execute on function private.ai_chat_claim_persistence_request(
  uuid, uuid, uuid, text, text, uuid
) to service_role;
revoke all on function private.ai_chat_complete_persistence_request(
  uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function private.ai_chat_complete_persistence_request(
  uuid, uuid, uuid
) to service_role;
revoke all on function private.ai_chat_release_persistence_request(
  uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function private.ai_chat_release_persistence_request(
  uuid, uuid, uuid
) to service_role;

create or replace function private.external_chat_fence_binding_update()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  if old.is_enabled is distinct from new.is_enabled
    or old.settings->'chat' is distinct from new.settings->'chat' then
    perform pg_advisory_xact_lock(hashtextextended(new.ws_id::text, 0));
    if exists (
      select 1 from private.external_chat_outbound_deliveries
      where ws_id = new.ws_id
        and delivered_at is null
        and cancelled_at is null
        and completed_at is null
        and created_at > now() - interval '2 minutes'
    ) then
      raise exception 'external_chat_delivery_in_progress';
    end if;
  end if;

  if old.settings #>> '{chat,bridgeBaseUrl}'
    is distinct from new.settings #>> '{chat,bridgeBaseUrl}' then
    update private.external_chat_binding_credentials
    set configuration_revision = configuration_revision + 1,
        verified_at = null,
        verified_revision = null
    where ws_id = new.ws_id;
  end if;

  return new;
end;
$$;

create trigger workspace_external_project_bindings_external_chat_fence
  before update on public.workspace_external_project_bindings
  for each row execute function private.external_chat_fence_binding_update();

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
