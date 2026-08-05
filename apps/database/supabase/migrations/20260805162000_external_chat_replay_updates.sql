alter table private.external_chat_outbound_deliveries
  add column remote_message_id text;

alter table private.external_chat_outbound_deliveries
  add constraint external_chat_outbound_remote_message_length check (
    remote_message_id is null
    or char_length(remote_message_id) between 1 and 255
  );

create unique index external_chat_outbound_remote_message_key
  on private.external_chat_outbound_deliveries (
    ws_id, thread_id, remote_message_id
  )
  where remote_message_id is not null;

create or replace function private.external_chat_resolve_delivery_identity()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_remote_message_id text;
begin
  if new.direction <> 'staff' then
    return new;
  end if;

  select delivery.remote_message_id into v_remote_message_id
  from private.external_chat_outbound_deliveries delivery
  where delivery.ws_id = new.ws_id
    and delivery.thread_id = new.thread_id
    and delivery.idempotency_key::text = new.remote_message_id
    and delivery.remote_message_id is not null;

  new.remote_message_id := coalesce(v_remote_message_id, new.remote_message_id);
  return new;
end;
$$;

revoke all on function private.external_chat_resolve_delivery_identity()
  from public, anon, authenticated;

create trigger external_chat_events_resolve_delivery_identity
  before insert on private.external_chat_events
  for each row execute function private.external_chat_resolve_delivery_identity();

alter function private.external_chat_import_event(
  uuid, text, text, text, text, text, text, timestamptz, bigint, jsonb, jsonb, uuid
) rename to external_chat_import_event_base;

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
  v_result jsonb;
  v_event private.external_chat_events%rowtype;
  v_thread private.external_chat_threads%rowtype;
  v_title text;
begin
  v_result := private.external_chat_import_event_base(
    p_ws_id,
    p_connector_key,
    p_remote_agent_id,
    p_remote_visitor_id,
    p_remote_message_id,
    p_direction,
    p_content,
    p_occurred_at,
    p_configuration_revision,
    p_thread_metadata,
    p_message_metadata,
    p_mapped_user_id
  );

  if coalesce((v_result->>'duplicate')::boolean, false) is not true then
    return v_result;
  end if;

  select * into v_event
  from private.external_chat_events
  where ws_id = p_ws_id
    and connector_key = p_connector_key
    and remote_message_id = p_remote_message_id
  for update;

  if v_event.id is null then
    return v_result;
  end if;

  select * into v_thread
  from private.external_chat_threads
  where id = v_event.thread_id
  for update;

  if v_thread.remote_agent_id <> coalesce(p_remote_agent_id, '')
    or v_thread.remote_visitor_id <> p_remote_visitor_id then
    raise exception 'external_chat_message_identity_mismatch';
  end if;

  update private.external_chat_threads
  set metadata = metadata || coalesce(p_thread_metadata, '{}'::jsonb)
  where id = v_thread.id;

  v_title := left(nullif(p_thread_metadata->>'displayName', ''), 255);
  update private.chat_conversations
  set title = coalesce(v_title, title),
      metadata = metadata || coalesce(p_thread_metadata, '{}'::jsonb),
      updated_at = greatest(updated_at, coalesce(p_occurred_at, now()))
  where id = v_thread.conversation_id;

  update private.external_chat_events
  set direction = p_direction,
      metadata = metadata || (coalesce(p_message_metadata, '{}'::jsonb) - 'status')
  where id = v_event.id;

  update private.chat_messages
  set content = case when deleted_at is null then coalesce(p_content, '') else content end,
      metadata = metadata
        || (coalesce(p_message_metadata, '{}'::jsonb) - 'status')
        || jsonb_build_object(
          'externalChat', true,
          'externalSender',
            coalesce(p_message_metadata->'externalSender', '{}'::jsonb)
              || jsonb_build_object('direction', p_direction),
          'remoteMessageId', p_remote_message_id
        )
  where id = v_event.message_id;

  return v_result || jsonb_build_object(
    'conversation', private.chat_conversation_json(
      v_thread.conversation_id,
      p_mapped_user_id
    ),
    'message', (
      select private.chat_message_json(message_row)
      from private.chat_messages message_row
      where message_row.id = v_event.message_id
    )
  );
end;
$$;

revoke all on function private.external_chat_import_event_base(
  uuid, text, text, text, text, text, text, timestamptz, bigint, jsonb, jsonb, uuid
) from public, anon, authenticated, service_role;
revoke all on function private.external_chat_import_event(
  uuid, text, text, text, text, text, text, timestamptz, bigint, jsonb, jsonb, uuid
) from public, anon, authenticated;
grant execute on function private.external_chat_import_event(
  uuid, text, text, text, text, text, text, timestamptz, bigint, jsonb, jsonb, uuid
) to service_role;

create or replace function private.external_chat_apply_message_state(
  p_ws_id uuid,
  p_connector_key text,
  p_remote_message_id text,
  p_status text,
  p_occurred_at timestamptz,
  p_deleted boolean default false,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_event private.external_chat_events%rowtype;
  v_state_occurred_at timestamptz;
  v_existing_status text;
  v_existing_rank integer;
  v_incoming_rank integer;
  v_conversation_id uuid;
begin
  if char_length(coalesce(p_status, '')) > 80
    or jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'external_chat_invalid_state';
  end if;

  select * into v_event
  from private.external_chat_events
  where ws_id = p_ws_id
    and connector_key = p_connector_key
    and remote_message_id = p_remote_message_id
  for update;

  if v_event.id is null then
    return jsonb_build_object('found', false);
  end if;

  select conversation_id into v_conversation_id
  from private.external_chat_threads
  where id = v_event.thread_id;

  select nullif(metadata->>'stateOccurredAt', '')::timestamptz,
         metadata->>'status'
  into v_state_occurred_at, v_existing_status
  from private.chat_messages
  where id = v_event.message_id;

  v_existing_rank := case lower(coalesce(v_existing_status, ''))
    when 'deleted' then 100
    when 'removed' then 100
    when 'failed' then 90
    when 'seen' then 80
    when 'read' then 80
    when 'received' then 60
    when 'recive' then 60
    when 'delivered' then 60
    when 'sent' then 40
    when 'send' then 40
    else 0
  end;
  v_incoming_rank := case
    when p_deleted then 100
    else case lower(coalesce(p_status, ''))
      when 'deleted' then 100
      when 'removed' then 100
      when 'failed' then 90
      when 'seen' then 80
      when 'read' then 80
      when 'received' then 60
      when 'recive' then 60
      when 'delivered' then 60
      when 'sent' then 40
      when 'send' then 40
      else 0
    end
  end;

  if v_state_occurred_at is not null
    and (
      v_state_occurred_at > coalesce(p_occurred_at, now())
      or (
        v_state_occurred_at = coalesce(p_occurred_at, now())
        and v_existing_rank > v_incoming_rank
      )
    ) then
    return jsonb_build_object(
      'found', true,
      'conversationId', v_conversation_id,
      'message', (
        select private.chat_message_json(message_row)
        from private.chat_messages message_row
        where message_row.id = v_event.message_id
      ),
      'messageId', v_event.message_id,
      'stale', true,
      'threadId', v_event.thread_id
    );
  end if;

  update private.external_chat_events
  set metadata = metadata || coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object('status', p_status),
      event_kind = case when p_deleted then 'message_deleted' else 'message_state' end,
      deleted_at = case when p_deleted then coalesce(p_occurred_at, now()) else deleted_at end
  where id = v_event.id;

  update private.chat_messages
  set metadata = metadata || coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'status', p_status,
        'deleted', p_deleted,
        'stateOccurredAt', coalesce(p_occurred_at, now())
      ),
      content = case when p_deleted then '' else content end,
      deleted_at = case
        when p_deleted then coalesce(p_occurred_at, now())
        else deleted_at
      end
  where id = v_event.message_id;

  return jsonb_build_object(
    'found', true,
    'conversationId', v_conversation_id,
    'message', (
      select private.chat_message_json(message_row)
      from private.chat_messages message_row
      where message_row.id = v_event.message_id
    ),
    'messageId', v_event.message_id,
    'threadId', v_event.thread_id
  );
end;
$$;

revoke all on function private.external_chat_apply_message_state(
  uuid, text, text, text, timestamptz, boolean, jsonb
) from public, anon, authenticated;
grant execute on function private.external_chat_apply_message_state(
  uuid, text, text, text, timestamptz, boolean, jsonb
) to service_role;

alter function private.external_chat_finalize_reply(
  uuid, uuid, uuid, text, text, uuid
) rename to external_chat_finalize_reply_base;

create function private.external_chat_attach_message_files(
  p_ws_id uuid,
  p_conversation_id uuid,
  p_message_id uuid,
  p_actor_user_id uuid,
  p_attachments jsonb
)
returns void
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_attachment jsonb;
  v_storage_path text;
  v_full_path text;
  v_size_bytes bigint;
begin
  if jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) = 0 then
    return;
  end if;
  if exists (
    select 1 from private.chat_message_attachments
    where message_id = p_message_id
  ) then
    return;
  end if;

  for v_attachment in
    select value from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb))
  loop
    v_storage_path := v_attachment->>'path';
    v_full_path := v_attachment->>'fullPath';
    v_size_bytes := nullif(v_attachment->>'sizeBytes', '')::bigint;
    if v_storage_path is null or not starts_with(
      v_storage_path,
      format('chats/%s/', p_conversation_id)
    ) then
      raise exception 'chat_attachment_path_forbidden' using errcode = '42501';
    end if;
    if v_full_path is not null and not starts_with(
      v_full_path,
      format('%s/chats/%s/', p_ws_id, p_conversation_id)
    ) then
      raise exception 'chat_attachment_full_path_forbidden' using errcode = '42501';
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
    ) values (
      p_conversation_id,
      p_message_id,
      p_actor_user_id,
      v_storage_path,
      v_full_path,
      coalesce(nullif(v_attachment->>'filename', ''), 'attachment'),
      nullif(v_attachment->>'contentType', ''),
      v_size_bytes,
      coalesce(v_attachment->'metadata', '{}'::jsonb)
    );
  end loop;
end;
$$;

create function private.external_chat_finalize_reply(
  p_ws_id uuid,
  p_delivery_id uuid,
  p_actor_user_id uuid,
  p_content text,
  p_payload_hash text,
  p_reply_to_message_id uuid default null,
  p_attachments jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_result jsonb;
  v_message_id uuid;
  v_conversation_id uuid;
begin
  v_result := private.external_chat_finalize_reply_base(
    p_ws_id,
    p_delivery_id,
    p_actor_user_id,
    p_content,
    p_payload_hash,
    p_reply_to_message_id
  );
  v_message_id := (v_result #>> '{message,id}')::uuid;
  v_conversation_id := (v_result #>> '{message,conversationId}')::uuid;
  perform private.external_chat_attach_message_files(
    p_ws_id,
    v_conversation_id,
    v_message_id,
    p_actor_user_id,
    p_attachments
  );
  return jsonb_set(
    v_result,
    '{message}',
    (
      select private.chat_message_json(message_row)
      from private.chat_messages message_row
      where message_row.id = v_message_id
    )
  );
end;
$$;

revoke all on function private.external_chat_finalize_reply_base(
  uuid, uuid, uuid, text, text, uuid
) from public, anon, authenticated, service_role;
revoke all on function private.external_chat_attach_message_files(
  uuid, uuid, uuid, uuid, jsonb
) from public, anon, authenticated, service_role;
revoke all on function private.external_chat_finalize_reply(
  uuid, uuid, uuid, text, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function private.external_chat_finalize_reply(
  uuid, uuid, uuid, text, text, uuid, jsonb
) to service_role;
