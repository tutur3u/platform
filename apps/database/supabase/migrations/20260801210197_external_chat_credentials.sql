
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
    or p_expires_at is null
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
