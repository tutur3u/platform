create or replace function private.external_chat_claim_source_event(
  p_ws_id uuid,
  p_connector_key text,
  p_source_event_id text,
  p_source_record_id text,
  p_event_kind text,
  p_delivery_mode text,
  p_payload_digest text,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_existing private.external_chat_source_events%rowtype;
  v_claimed boolean := false;
begin
  insert into private.external_chat_source_events (
    ws_id, connector_key, source_event_id, source_record_id, event_kind,
    delivery_mode, payload_digest, result, occurred_at
  ) values (
    p_ws_id, p_connector_key, p_source_event_id, p_source_record_id,
    p_event_kind, p_delivery_mode, p_payload_digest,
    jsonb_build_object('claimState', 'processing'), p_occurred_at
  )
  on conflict (ws_id, connector_key, source_event_id) do nothing
  returning true into v_claimed;

  if v_claimed then
    return jsonb_build_object('status', 'claimed');
  end if;

  select * into v_existing
  from private.external_chat_source_events
  where ws_id = p_ws_id
    and connector_key = p_connector_key
    and source_event_id = p_source_event_id
  for update;

  if v_existing.payload_digest <> p_payload_digest then
    return jsonb_build_object('status', 'payload_mismatch');
  end if;

  if v_existing.result->>'claimState' = 'processing' then
    if v_existing.created_at <= now() - interval '5 minutes' then
      update private.external_chat_source_events
      set source_record_id = p_source_record_id,
          event_kind = p_event_kind,
          delivery_mode = p_delivery_mode,
          occurred_at = p_occurred_at,
          created_at = now()
      where id = v_existing.id;
      return jsonb_build_object('status', 'claimed');
    end if;
    return jsonb_build_object('status', 'in_progress');
  end if;

  if v_existing.delivery_mode = 'probe'
     and p_delivery_mode in ('live', 'historical') then
    update private.external_chat_source_events
    set source_record_id = p_source_record_id,
        event_kind = p_event_kind,
        delivery_mode = p_delivery_mode,
        occurred_at = p_occurred_at
    where id = v_existing.id;
  end if;

  return jsonb_build_object(
    'status', 'duplicate',
    'result', v_existing.result
  );
end;
$$;

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
returns boolean
language sql
security definer
set search_path = private, public, pg_temp
as $$
  with finalized as (
    update private.external_chat_source_events
    set source_record_id = p_source_record_id,
        event_kind = p_event_kind,
        delivery_mode = p_delivery_mode,
        thread_id = p_thread_id,
        result = coalesce(p_result, '{}'::jsonb),
        occurred_at = p_occurred_at
    where ws_id = p_ws_id
      and connector_key = p_connector_key
      and source_event_id = p_source_event_id
      and payload_digest = p_payload_digest
      and result->>'claimState' = 'processing'
    returning 1
  )
  select exists(select 1 from finalized);
$$;

create or replace function private.external_chat_release_source_event(
  p_ws_id uuid,
  p_connector_key text,
  p_source_event_id text,
  p_payload_digest text
)
returns void
language sql
security definer
set search_path = private, public, pg_temp
as $$
  delete from private.external_chat_source_events
  where ws_id = p_ws_id
    and connector_key = p_connector_key
    and source_event_id = p_source_event_id
    and payload_digest = p_payload_digest
    and result->>'claimState' = 'processing';
$$;

create or replace function private.external_chat_compare_and_set_sync_run(
  p_ws_id uuid,
  p_run_id uuid,
  p_expected_state text,
  p_expected_updated_at timestamptz,
  p_update jsonb
)
returns boolean
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_updated boolean;
begin
  update private.external_chat_sync_runs
  set state = coalesce(p_update->>'state', state),
      cursor = coalesce(p_update->'cursor', cursor),
      high_water_mark = coalesce(p_update->'high_water_mark', high_water_mark),
      source_counts = coalesce(p_update->'source_counts', source_counts),
      target_counts = coalesce(p_update->'target_counts', target_counts),
      digest_results = coalesce(p_update->'digest_results', digest_results),
      error_code = case
        when p_update ? 'error_code' then p_update->>'error_code'
        else error_code
      end,
      started_at = case
        when p_update ? 'started_at' then (p_update->>'started_at')::timestamptz
        else started_at
      end,
      finished_at = case
        when p_update ? 'finished_at' then (p_update->>'finished_at')::timestamptz
        else finished_at
      end,
      updated_at = coalesce((p_update->>'updated_at')::timestamptz, now())
  where id = p_run_id
    and ws_id = p_ws_id
    and state = p_expected_state
    and updated_at = p_expected_updated_at
  returning true into v_updated;
  return coalesce(v_updated, false);
end;
$$;

revoke all on function private.external_chat_claim_source_event(
  uuid, text, text, text, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function private.external_chat_record_source_event(
  uuid, text, text, text, text, text, text, uuid, jsonb, timestamptz
) from public, anon, authenticated;
revoke all on function private.external_chat_release_source_event(
  uuid, text, text, text
) from public, anon, authenticated;
revoke all on function private.external_chat_compare_and_set_sync_run(
  uuid, uuid, text, timestamptz, jsonb
) from public, anon, authenticated;

grant execute on function private.external_chat_claim_source_event(
  uuid, text, text, text, text, text, text, timestamptz
) to service_role;
grant execute on function private.external_chat_record_source_event(
  uuid, text, text, text, text, text, text, uuid, jsonb, timestamptz
) to service_role;
grant execute on function private.external_chat_release_source_event(
  uuid, text, text, text
) to service_role;
grant execute on function private.external_chat_compare_and_set_sync_run(
  uuid, uuid, text, timestamptz, jsonb
) to service_role;
