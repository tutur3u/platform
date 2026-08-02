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
    select * into v_existing_message
    from private.chat_messages m
    where m.id = v_delivery.message_id
      and m.conversation_id = v_thread.conversation_id;
    if v_existing_message.id is null
      or v_existing_message.content is distinct from p_content
      or v_existing_message.reply_to_message_id is distinct from p_reply_to_message_id then
      raise exception 'external_chat_idempotency_payload_mismatch';
    end if;
    return jsonb_build_object(
      'message', private.chat_message_json(v_existing_message),
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
