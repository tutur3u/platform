create or replace function private.external_chat_record_source_event(
  p_ws_id uuid,
  p_connector_key text,
  p_source_event_id text,
  p_source_record_id text,
  p_event_kind text,
  p_delivery_mode text,
  p_payload_digest text,
  p_thread_id uuid,
  p_result jsonb,
  p_occurred_at timestamptz
)
returns void
language sql
security definer
set search_path = private, public, pg_temp
as $$
  insert into private.external_chat_source_events (
    ws_id, connector_key, source_event_id, source_record_id, event_kind,
    delivery_mode, payload_digest, thread_id, result, occurred_at
  ) values (
    p_ws_id, p_connector_key, p_source_event_id, p_source_record_id,
    p_event_kind, p_delivery_mode, p_payload_digest, p_thread_id,
    coalesce(p_result, '{}'::jsonb), p_occurred_at
  )
  on conflict (ws_id, connector_key, source_event_id) do update
  set source_record_id = excluded.source_record_id,
      event_kind = excluded.event_kind,
      delivery_mode = excluded.delivery_mode,
      payload_digest = excluded.payload_digest,
      thread_id = excluded.thread_id,
      result = excluded.result,
      occurred_at = excluded.occurred_at
  where external_chat_source_events.delivery_mode = 'probe'
    and excluded.delivery_mode in ('live', 'historical');
$$;

revoke all on function private.external_chat_record_source_event(
  uuid, text, text, text, text, text, text, uuid, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function private.external_chat_record_source_event(
  uuid, text, text, text, text, text, text, uuid, jsonb, timestamptz
) to service_role;
