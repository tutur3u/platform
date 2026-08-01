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
begin
  if jsonb_typeof(p_chat) <> 'object' then
    raise exception 'external_chat_invalid_settings';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_ws_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':', p_ws_id, 'pairing'), 0));
  if exists (
    select 1 from private.external_chat_outbound_deliveries
    where ws_id = p_ws_id
      and delivered_at is null
      and cancelled_at is null
      and completed_at is null
      and created_at > now() - interval '2 minutes'
  ) then
    raise exception 'external_chat_delivery_in_progress';
  end if;
  perform 1 from public.workspace_external_project_bindings
  where ws_id = p_ws_id for update;
  if not found then raise exception 'external_chat_binding_not_found'; end if;
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
  v_pairing_in_progress boolean;
begin
  if p_action is null or p_action not in (
    'set_ingest', 'rotate_control', 'clear_ingest', 'clear_control'
  ) then
    raise exception 'external_chat_invalid_credential_action';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_ws_id::text, 0));
  if exists (
    select 1 from private.external_chat_outbound_deliveries
    where ws_id = p_ws_id
      and delivered_at is null
      and cancelled_at is null
      and completed_at is null
      and created_at > now() - interval '2 minutes'
  ) then
    raise exception 'external_chat_delivery_in_progress';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':', p_ws_id, 'pairing'), 0));
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':', p_ws_id, 'credential'), 0));
  if exists (
    select 1 from private.external_chat_binding_credentials
    where ws_id = p_ws_id
      and pairing_ticket_hash is not null
      and pairing_ticket_consumed_at is null
      and pairing_ticket_expires_at > now()
  ) then
    raise exception 'external_chat_pairing_in_progress';
  end if;
  insert into private.external_chat_binding_credentials (ws_id)
  values (p_ws_id) on conflict (ws_id) do nothing;
  select pending_action,
    pairing_ticket_hash is not null and pairing_ticket_expires_at > now()
  into v_pending_action, v_pairing_in_progress
  from private.external_chat_binding_credentials
  where ws_id = p_ws_id for update;
  if v_pending_action is not null then
    raise exception 'external_chat_credential_reconciliation_pending';
  end if;
  if v_pairing_in_progress then
    raise exception 'external_chat_pairing_in_progress';
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
  perform pg_advisory_xact_lock(hashtextextended(p_ws_id::text, 0));
  if exists (
    select 1 from private.external_chat_outbound_deliveries
    where ws_id = p_ws_id
      and delivered_at is null
      and cancelled_at is null
      and completed_at is null
      and created_at > now() - interval '2 minutes'
  ) then
    raise exception 'external_chat_delivery_in_progress';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':', p_ws_id, 'credential'), 0));
  select * into v_credentials
  from private.external_chat_binding_credentials
  where ws_id = p_ws_id for update;
  if v_credentials.pending_action is distinct from p_action
    or v_credentials.pending_secret_encrypted is distinct from p_secret_encrypted then
    raise exception 'external_chat_pending_credential_changed';
  end if;

  update private.external_chat_binding_credentials
  set ingest_secret_hash = case
        when p_action in ('clear_ingest', 'clear_control') then null
        when p_action = 'set_ingest' then pending_secret_hash
        else ingest_secret_hash
      end,
      ingest_secret_last_four = case
        when p_action in ('clear_ingest', 'clear_control') then null
        when p_action = 'set_ingest' then pending_secret_last_four
        else ingest_secret_last_four
      end,
      ingest_secret_rotated_at = case
        when p_action in ('clear_ingest', 'clear_control') then null
        when p_action = 'set_ingest' then now()
        else ingest_secret_rotated_at
      end,
      control_secret_encrypted = case
        when p_action = 'clear_control' then null
        when p_action = 'rotate_control' then pending_secret_encrypted
        else control_secret_encrypted
      end,
      control_secret_last_four = case
        when p_action = 'clear_control' then null
        when p_action = 'rotate_control' then pending_secret_last_four
        else control_secret_last_four
      end,
      control_secret_rotated_at = case
        when p_action = 'clear_control' then null
        when p_action = 'rotate_control' then now()
        else control_secret_rotated_at
      end,
      pending_action = null,
      pending_secret_encrypted = null,
      pending_secret_hash = null,
      pending_secret_last_four = null,
      pending_created_at = null,
      configuration_revision = configuration_revision + 1,
      verified_at = null,
      verified_revision = null,
      pairing_ticket_hash = case when p_action = 'clear_control' then null else pairing_ticket_hash end,
      pairing_ticket_issued_at = case when p_action = 'clear_control' then null else pairing_ticket_issued_at end,
      pairing_ticket_expires_at = case when p_action = 'clear_control' then null else pairing_ticket_expires_at end,
      pairing_ticket_consumed_at = case when p_action = 'clear_control' then null else pairing_ticket_consumed_at end
  where ws_id = p_ws_id;
end;
$$;

create or replace function private.external_chat_mark_verified(
  p_ws_id uuid,
  p_control_secret_encrypted text,
  p_configuration_revision bigint
)
returns boolean
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_updated integer;
begin
  update private.external_chat_binding_credentials
  set verified_at = now()
      , verified_revision = configuration_revision
  where ws_id = p_ws_id
    and pending_action is null
    and control_secret_encrypted = p_control_secret_encrypted
    and configuration_revision = p_configuration_revision;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function private.external_chat_clear_credential(
  p_ws_id uuid,
  p_kind text
)
returns void
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  if p_kind is null or p_kind not in ('control', 'ingest') then
    raise exception 'external_chat_invalid_credential_kind';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_ws_id::text, 0));
  if exists (
    select 1 from private.external_chat_outbound_deliveries
    where ws_id = p_ws_id
      and delivered_at is null
      and cancelled_at is null
      and completed_at is null
      and created_at > now() - interval '2 minutes'
  ) then
    raise exception 'external_chat_delivery_in_progress';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':', p_ws_id, 'pairing'), 0));
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':', p_ws_id, 'credential'), 0));
  if exists (
    select 1 from private.external_chat_binding_credentials
    where ws_id = p_ws_id
      and pairing_ticket_hash is not null
      and pairing_ticket_consumed_at is null
      and pairing_ticket_expires_at > now()
  ) then
    raise exception 'external_chat_pairing_in_progress';
  end if;
  update private.external_chat_binding_credentials
  set ingest_secret_hash = case when p_kind in ('control', 'ingest') then null else ingest_secret_hash end,
      ingest_secret_last_four = case when p_kind in ('control', 'ingest') then null else ingest_secret_last_four end,
      ingest_secret_rotated_at = case when p_kind in ('control', 'ingest') then null else ingest_secret_rotated_at end,
      control_secret_encrypted = case when p_kind = 'control' then null else control_secret_encrypted end,
      control_secret_last_four = case when p_kind = 'control' then null else control_secret_last_four end,
      control_secret_rotated_at = case when p_kind = 'control' then null else control_secret_rotated_at end,
      pending_action = case
        when p_kind = 'control' or pending_action = 'set_ingest' then null
        else pending_action
      end,
      pending_secret_encrypted = case
        when p_kind = 'control' or pending_action = 'set_ingest' then null
        else pending_secret_encrypted
      end,
      pending_secret_hash = case
        when p_kind = 'control' or pending_action = 'set_ingest' then null
        else pending_secret_hash
      end,
      pending_secret_last_four = case
        when p_kind = 'control' or pending_action = 'set_ingest' then null
        else pending_secret_last_four
      end,
      pending_created_at = case
        when p_kind = 'control' or pending_action = 'set_ingest' then null
        else pending_created_at
      end,
      configuration_revision = configuration_revision + 1,
      verified_at = null,
      verified_revision = null,
      pairing_ticket_hash = case when p_kind = 'control' then null else pairing_ticket_hash end,
      pairing_ticket_issued_at = case when p_kind = 'control' then null else pairing_ticket_issued_at end,
      pairing_ticket_expires_at = case when p_kind = 'control' then null else pairing_ticket_expires_at end,
      pairing_ticket_consumed_at = case when p_kind = 'control' then null else pairing_ticket_consumed_at end
  where ws_id = p_ws_id;
end;
$$;

revoke all on function private.external_chat_stage_credential(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function private.external_chat_promote_credential(uuid, text, text) from public, anon, authenticated;
revoke all on function private.external_chat_mark_verified(uuid, text, bigint) from public, anon, authenticated;
revoke all on function private.external_chat_clear_credential(uuid, text) from public, anon, authenticated;
grant execute on function private.external_chat_stage_credential(uuid, text, text, text, text) to service_role;
grant execute on function private.external_chat_promote_credential(uuid, text, text) to service_role;
grant execute on function private.external_chat_mark_verified(uuid, text, bigint) to service_role;
grant execute on function private.external_chat_clear_credential(uuid, text) to service_role;

create or replace function private.external_chat_issue_pairing_ticket(
  p_ws_id uuid,
  p_ticket_hash text,
  p_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  if char_length(coalesce(p_ticket_hash, '')) <> 64
    or p_expires_at <= now()
    or p_expires_at > now() + interval '10 minutes' then
    raise exception 'external_chat_invalid_pairing_ticket';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':', p_ws_id, 'pairing'), 0));
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':', p_ws_id, 'credential'), 0));
  insert into private.external_chat_binding_credentials (ws_id)
  values (p_ws_id) on conflict (ws_id) do nothing;
  if exists (
    select 1 from private.external_chat_binding_credentials
    where ws_id = p_ws_id and pending_action is not null
  ) then
    raise exception 'external_chat_credential_reconciliation_pending';
  end if;
  update private.external_chat_binding_credentials
  set pairing_ticket_hash = p_ticket_hash,
      pairing_ticket_issued_at = now(),
      pairing_ticket_expires_at = p_expires_at,
      pairing_ticket_consumed_at = null
  where ws_id = p_ws_id;
end;
$$;

create or replace function private.external_chat_consume_pairing_ticket(
  p_ws_id uuid,
  p_ticket_hash text
)
returns boolean
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_updated integer;
begin
  if char_length(coalesce(p_ticket_hash, '')) <> 64 then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':', p_ws_id, 'pairing'), 0));
  update private.external_chat_binding_credentials
  set pairing_ticket_hash = null,
      pairing_ticket_consumed_at = now()
  where ws_id = p_ws_id
    and pairing_ticket_hash = p_ticket_hash
    and pairing_ticket_consumed_at is null
    and pairing_ticket_expires_at > now();
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function private.external_chat_issue_pairing_ticket(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function private.external_chat_consume_pairing_ticket(uuid, text) from public, anon, authenticated;
grant execute on function private.external_chat_issue_pairing_ticket(uuid, text, timestamptz) to service_role;
grant execute on function private.external_chat_consume_pairing_ticket(uuid, text) to service_role;

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
          page.created_at desc
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
          c.created_at
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
        ranked.created_at desc
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

create or replace function private.external_chat_import_event(
  p_ws_id uuid,
  p_connector_key text,
  p_remote_agent_id text,
  p_remote_visitor_id text,
  p_remote_message_id text,
  p_direction text,
  p_content text,
  p_occurred_at timestamptz,
  p_configuration_revision bigint,
  p_thread_metadata jsonb default '{}'::jsonb,
  p_message_metadata jsonb default '{}'::jsonb,
  p_mapped_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_thread private.external_chat_threads%rowtype;
  v_delivery private.external_chat_outbound_deliveries%rowtype;
  v_conversation_id uuid;
  v_conversation_created boolean := false;
  v_message_id uuid;
  v_existing_message_id uuid;
  v_existing_thread_id uuid;
  v_title text;
begin
  if p_connector_key is null or btrim(p_connector_key) = ''
    or p_remote_visitor_id is null or btrim(p_remote_visitor_id) = ''
    or p_remote_message_id is null or btrim(p_remote_message_id) = '' then
    raise exception 'external_chat_invalid_identity';
  end if;

  if p_direction is null or p_direction not in ('visitor', 'staff', 'system') then
    raise exception 'external_chat_invalid_direction';
  end if;

  if char_length(coalesce(p_content, '')) > 10000
    or octet_length(coalesce(p_content, '')) > 40000 then
    raise exception 'external_chat_content_too_large';
  end if;

  if jsonb_typeof(coalesce(p_thread_metadata, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_message_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'external_chat_invalid_metadata';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_ws_id::text, 0));
  if not exists (
    select 1
    from public.workspace_external_project_bindings b
    join private.external_chat_binding_credentials c on c.ws_id = b.ws_id
    where b.ws_id = p_ws_id
      and b.is_enabled = true
      and b.settings #>> '{chat,enabled}' = 'true'
      and coalesce(b.settings #>> '{chat,authorityMode}', 'legacy_primary')
        not in ('fallback_queue', 'paused')
      and c.verified_at is not null
      and c.verified_revision = c.configuration_revision
      and c.configuration_revision = p_configuration_revision
  ) then
    raise exception 'external_chat_binding_unavailable';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', p_ws_id, p_connector_key, p_remote_message_id),
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', p_ws_id, p_connector_key, coalesce(p_remote_agent_id, ''), p_remote_visitor_id),
    0
  ));

  select e.message_id, e.thread_id
  into v_existing_message_id, v_existing_thread_id
  from private.external_chat_events e
  where e.ws_id = p_ws_id
    and e.connector_key = p_connector_key
    and e.remote_message_id = p_remote_message_id;

  if v_existing_message_id is not null then
    select * into v_thread
    from private.external_chat_threads t
    where t.id = v_existing_thread_id;

    return jsonb_build_object(
      'conversation', private.chat_conversation_json(v_thread.conversation_id, p_mapped_user_id),
      'conversationCreated', false,
      'conversationId', v_thread.conversation_id,
      'duplicate', true,
      'message', (select private.chat_message_json(m) from private.chat_messages m where m.id = v_existing_message_id),
      'messageId', v_existing_message_id,
      'threadId', v_existing_thread_id
    );
  end if;

  select * into v_thread
  from private.external_chat_threads t
  where t.ws_id = p_ws_id
    and t.connector_key = p_connector_key
    and t.remote_agent_id = coalesce(p_remote_agent_id, '')
    and t.remote_visitor_id = p_remote_visitor_id;

  if v_thread.id is null then
    v_title := left(nullif(p_thread_metadata->>'displayName', ''), 255);
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
    v_conversation_created := true;

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

  if p_direction = 'staff' then
    select * into v_delivery
    from private.external_chat_outbound_deliveries d
    where d.ws_id = p_ws_id
      and d.thread_id = v_thread.id
      and d.idempotency_key::text = p_remote_message_id
    for update;
  end if;

  update private.chat_conversations
  set archived_at = null,
      updated_at = greatest(updated_at, coalesce(p_occurred_at, now()))
  where id = v_thread.conversation_id;

  if p_mapped_user_id is not null and exists (
    select 1 from public.workspace_members wm
    where wm.ws_id = p_ws_id and wm.user_id = p_mapped_user_id
  ) then
    insert into private.chat_conversation_members (
      conversation_id, user_id, role, metadata
    ) values (
      v_thread.conversation_id, p_mapped_user_id, 'member',
      jsonb_build_object('externalRouting', true)
    )
    on conflict (conversation_id, user_id) do update
    set archived_at = null,
        metadata = private.chat_conversation_members.metadata || excluded.metadata;
  end if;

  insert into private.chat_messages (
    conversation_id, sender_id, kind, content, reply_to_message_id, metadata, created_at
  ) values (
    v_thread.conversation_id,
    v_delivery.actor_user_id,
    case when p_direction = 'system' then 'system' else 'user' end,
    coalesce(p_content, ''),
    v_delivery.reply_to_message_id,
    coalesce(p_message_metadata, '{}'::jsonb) || jsonb_build_object(
      'externalChat', true,
      'externalSender',
        coalesce(p_message_metadata->'externalSender', '{}'::jsonb)
          || jsonb_build_object('direction', p_direction),
      'remoteMessageId', p_remote_message_id,
      'nativeOrigin', v_delivery.id is not null
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

  if v_delivery.id is not null then
    update private.external_chat_outbound_deliveries
    set message_id = v_message_id,
        completed_at = now()
    where id = v_delivery.id;
  end if;

  return jsonb_build_object(
    'conversation', private.chat_conversation_json(v_thread.conversation_id, p_mapped_user_id),
    'conversationCreated', v_conversation_created,
    'conversationId', v_thread.conversation_id,
    'duplicate', false,
    'message', (select private.chat_message_json(m) from private.chat_messages m where m.id = v_message_id),
    'messageId', v_message_id,
    'threadId', v_thread.id
  );
end;
$$;

revoke all on function private.external_chat_import_event(
  uuid, text, text, text, text, text, text, timestamptz, bigint, jsonb, jsonb, uuid
) from public, anon, authenticated;
grant execute on function private.external_chat_import_event(
  uuid, text, text, text, text, text, text, timestamptz, bigint, jsonb, jsonb, uuid
) to service_role;

create or replace function private.chat_persist_ai_message_batch(
  p_ws_id uuid,
  p_conversation_id uuid,
  p_actor_user_id uuid,
  p_messages jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_conversation private.chat_conversations%rowtype;
  v_item jsonb;
  v_message_id uuid;
  v_messages jsonb := '[]'::jsonb;
begin
  perform private.chat_assert_workspace_permission(
    p_ws_id,
    p_actor_user_id,
    'view_chat'
  );

  select * into v_conversation
  from private.chat_conversations
  where id = p_conversation_id
    and archived_at is null
    and type = 'ai'
    and private.chat_can_address_conversation_workspace(
      p_ws_id,
      ws_id,
      type,
      p_actor_user_id
    )
  for update;

  if v_conversation.id is null then return null; end if;
  if not private.chat_actor_can_access_conversation(
    p_conversation_id,
    p_actor_user_id
  ) then
    raise exception 'chat_conversation_forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(p_messages) <> 'array'
    or jsonb_array_length(p_messages) = 0
    or jsonb_array_length(p_messages) > 20 then
    raise exception 'chat_invalid_ai_message_batch' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_messages) loop
    if jsonb_typeof(v_item) <> 'object'
      or length(btrim(coalesce(v_item->>'content', ''))) = 0
      or length(v_item->>'content') > 10000
      or jsonb_typeof(coalesce(v_item->'metadata', '{}'::jsonb)) <> 'object' then
      raise exception 'chat_invalid_ai_message_batch' using errcode = '22023';
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_messages) loop
    insert into private.chat_messages (
      conversation_id, sender_id, kind, content, metadata
    ) values (
      p_conversation_id,
      null,
      'assistant',
      v_item->>'content',
      coalesce(v_item->'metadata', '{}'::jsonb)
    ) returning id into v_message_id;

    v_messages := v_messages || jsonb_build_array(
      (select private.chat_message_json(m)
       from private.chat_messages m where m.id = v_message_id)
    );
  end loop;

  update private.chat_conversations
  set updated_at = now()
  where id = p_conversation_id;

  update private.chat_conversation_members
  set last_read_at = now(), last_seen_message_id = v_message_id
  where conversation_id = p_conversation_id and user_id = p_actor_user_id;

  insert into private.chat_audit_events (
    ws_id, conversation_id, actor_id, event_type, metadata
  ) values (
    v_conversation.ws_id,
    p_conversation_id,
    p_actor_user_id,
    'message.sent',
    jsonb_build_object(
      'messageIds', (select jsonb_agg(value->>'id') from jsonb_array_elements(v_messages)),
      'kind', 'assistant',
      'assistantSource', 'native-ai'
    )
  );

  return v_messages;
end;
$$;

revoke all on function private.chat_persist_ai_message_batch(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function private.chat_persist_ai_message_batch(uuid, uuid, uuid, jsonb)
  to service_role;

create or replace function private.external_chat_reserve_reply(
  p_ws_id uuid,
  p_conversation_id uuid,
  p_actor_user_id uuid,
  p_request_fingerprint text,
  p_payload_hash text,
  p_reply_to_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_credentials private.external_chat_binding_credentials%rowtype;
  v_delivery private.external_chat_outbound_deliveries%rowtype;
  v_thread private.external_chat_threads%rowtype;
begin
  if char_length(coalesce(p_payload_hash, '')) <> 64 then
    raise exception 'external_chat_invalid_payload_hash';
  end if;
  perform private.chat_assert_workspace_permission(p_ws_id, p_actor_user_id, 'create_chat');
  if not private.chat_actor_can_access_conversation(p_conversation_id, p_actor_user_id) then
    raise exception 'chat_conversation_forbidden' using errcode = '42501';
  end if;
  if p_reply_to_message_id is not null and not exists (
    select 1 from private.chat_messages
    where id = p_reply_to_message_id
      and conversation_id = p_conversation_id
      and deleted_at is null
  ) then
    raise exception 'chat_reply_target_not_found';
  end if;

  select * into v_thread from private.external_chat_threads
  where ws_id = p_ws_id and conversation_id = p_conversation_id;
  if v_thread.id is null then return null; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_ws_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':', p_ws_id, p_request_fingerprint), 0));
  select * into v_credentials
  from private.external_chat_binding_credentials
  where ws_id = p_ws_id for update;
  if v_credentials.control_secret_encrypted is null
    or v_credentials.verified_at is null
    or v_credentials.verified_revision is distinct from v_credentials.configuration_revision
    or v_credentials.pending_action is not null
    or not exists (
      select 1 from public.workspace_external_project_bindings b
      where b.ws_id = p_ws_id
        and b.is_enabled = true
        and b.settings #>> '{chat,enabled}' = 'true'
        and coalesce(b.settings #>> '{chat,authorityMode}', 'legacy_primary')
          not in ('fallback_queue', 'paused')
    ) then
    raise exception 'external_chat_bridge_not_ready';
  end if;
  select * into v_delivery from private.external_chat_outbound_deliveries
  where ws_id = p_ws_id and request_fingerprint = p_request_fingerprint;

  if v_delivery.id is not null then
    if v_delivery.payload_hash <> p_payload_hash
      or v_delivery.actor_user_id is distinct from p_actor_user_id
      or v_delivery.reply_to_message_id is distinct from p_reply_to_message_id then
      raise exception 'external_chat_idempotency_payload_mismatch';
    end if;
    if v_delivery.cancelled_at is not null then
      update private.external_chat_outbound_deliveries
      set cancelled_at = null,
          configuration_revision = v_credentials.configuration_revision,
          actor_user_id = p_actor_user_id,
          reply_to_message_id = p_reply_to_message_id,
          created_at = now()
      where id = v_delivery.id
      returning * into v_delivery;
    end if;
    return jsonb_build_object(
      'deliveryId', v_delivery.id,
      'delivered', v_delivery.delivered_at is not null,
      'configurationRevision', v_delivery.configuration_revision,
      'idempotencyKey', v_delivery.idempotency_key,
      'messageId', v_delivery.message_id,
      'threadId', v_delivery.thread_id
    );
  end if;

  insert into private.external_chat_outbound_deliveries (
    ws_id, thread_id, request_fingerprint, payload_hash, configuration_revision,
    actor_user_id, reply_to_message_id
  ) values (
    p_ws_id, v_thread.id, p_request_fingerprint, p_payload_hash,
    v_credentials.configuration_revision, p_actor_user_id, p_reply_to_message_id
  )
  returning * into v_delivery;

  return jsonb_build_object(
    'deliveryId', v_delivery.id,
    'delivered', false,
    'configurationRevision', v_delivery.configuration_revision,
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
  p_payload_hash text,
  p_reply_to_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_delivery private.external_chat_outbound_deliveries%rowtype;
  v_thread private.external_chat_threads%rowtype;
  v_existing_message private.chat_messages%rowtype;
  v_message jsonb;
  v_message_id uuid;
begin
  select * into v_delivery from private.external_chat_outbound_deliveries
  where id = p_delivery_id and ws_id = p_ws_id;
  if v_delivery.id is null then raise exception 'external_chat_delivery_not_found'; end if;
  select * into v_thread
  from private.external_chat_threads
  where id = v_delivery.thread_id and ws_id = p_ws_id;
  if v_thread.id is null then raise exception 'external_chat_delivery_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', p_ws_id, v_thread.connector_key, v_delivery.idempotency_key::text),
    0
  ));
  select * into v_delivery from private.external_chat_outbound_deliveries
  where id = p_delivery_id and ws_id = p_ws_id for update;
  if v_delivery.payload_hash <> p_payload_hash then
    raise exception 'external_chat_idempotency_payload_mismatch';
  end if;
  if v_delivery.actor_user_id is distinct from p_actor_user_id
    or v_delivery.reply_to_message_id is distinct from p_reply_to_message_id then
    raise exception 'external_chat_idempotency_payload_mismatch';
  end if;
  if v_delivery.message_id is not null then
    return jsonb_build_object(
      'message', (select private.chat_message_json(m) from private.chat_messages m where m.id = v_delivery.message_id),
      'replayed', true
    );
  end if;
  if v_delivery.delivered_at is null then raise exception 'external_chat_delivery_unconfirmed'; end if;

  select m.* into v_existing_message
  from private.external_chat_events e
  join private.external_chat_threads t on t.id = e.thread_id
  join private.chat_messages m on m.id = e.message_id
  where e.ws_id = p_ws_id
    and e.thread_id = v_delivery.thread_id
    and e.connector_key = t.connector_key
    and e.remote_message_id = v_delivery.idempotency_key::text
    and e.direction = 'staff';
  if v_existing_message.id is not null then
    if v_existing_message.content is distinct from p_content
      or (
        v_existing_message.reply_to_message_id is not null
        and v_existing_message.reply_to_message_id is distinct from p_reply_to_message_id
      ) then
      raise exception 'external_chat_idempotency_payload_mismatch';
    end if;
    update private.chat_messages
    set sender_id = p_actor_user_id,
        reply_to_message_id = coalesce(reply_to_message_id, p_reply_to_message_id),
        metadata = metadata || jsonb_build_object('deliveredBy', 'control', 'nativeOrigin', true)
    where id = v_existing_message.id;
    update private.external_chat_outbound_deliveries
    set message_id = v_existing_message.id, completed_at = now()
    where id = v_delivery.id;
    return jsonb_build_object(
      'message', (
        select private.chat_message_json(m)
        from private.chat_messages m
        where m.id = v_existing_message.id
      ),
      'replayed', false
    );
  end if;

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
  return jsonb_build_object('message', v_message, 'replayed', false);
end;
$$;

revoke all on function private.external_chat_reserve_reply(uuid, uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function private.external_chat_finalize_reply(uuid, uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function private.external_chat_reserve_reply(uuid, uuid, uuid, text, text, uuid) to service_role;
grant execute on function private.external_chat_finalize_reply(uuid, uuid, uuid, text, text, uuid) to service_role;
