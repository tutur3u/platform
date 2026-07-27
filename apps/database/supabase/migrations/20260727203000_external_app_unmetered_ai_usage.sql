-- Registered external apps may temporarily use AI without workspace credit
-- deductions. They still pass the global/workspace model policy, workspace RPM
-- safety limit, idempotency, and complete metadata/usage auditing.

insert into private.ai_gateway_models (
  id,
  name,
  provider,
  description,
  type,
  context_window,
  max_tokens,
  tags,
  input_price_per_token,
  output_price_per_token,
  released_at,
  is_enabled,
  synced_at
)
values (
  'google/gemini-3.1-flash-tts-preview',
  'Gemini 3.1 Flash TTS Preview',
  'google',
  'Low-latency, controllable text-to-speech with text input and audio output.',
  'audio',
  8192,
  16384,
  array['audio', 'speech', 'tts', 'gemini'],
  0.000001,
  0.000020,
  '2026-04-01T00:00:00Z',
  true,
  now()
)
on conflict (id) do update set
  name = excluded.name,
  provider = excluded.provider,
  description = excluded.description,
  type = excluded.type,
  context_window = excluded.context_window,
  max_tokens = excluded.max_tokens,
  tags = excluded.tags,
  input_price_per_token = excluded.input_price_per_token,
  output_price_per_token = excluded.output_price_per_token,
  is_enabled = true,
  synced_at = now();

update public.ai_credit_plan_allocations
set allowed_models = case
  when coalesce(array_length(allowed_models, 1), 0) = 0 then allowed_models
  when array_position(
    allowed_models,
    'google/gemini-3.1-flash-tts-preview'
  ) is null then
    array_append(allowed_models, 'google/gemini-3.1-flash-tts-preview')
  else allowed_models
end,
updated_at = now()
where is_active;

create or replace function private.begin_external_ai_studio_run(
  p_request_id text,
  p_ws_id uuid,
  p_user_id uuid,
  p_external_app_id text,
  p_model_id text,
  p_feature text,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  success boolean,
  run_id uuid,
  error_code text
)
language plpgsql
security definer
set search_path to private, public, pg_temp
as $$
declare
  v_policy private.workspace_ai_studio_policies%rowtype;
  v_run_id uuid;
  v_effective_rpm integer;
  v_recent_requests integer;
  v_metadata jsonb;
begin
  if p_external_app_id is null
    or p_external_app_id !~ '^[a-z0-9_-]{1,64}$' then
    return query select false, null::uuid, 'INVALID_EXTERNAL_APP'::text;
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_ws_id::text || ':' || p_external_app_id, 0)
  );

  if not private.ai_studio_model_allowed(p_ws_id, null, p_model_id) then
    return query select false, null::uuid, 'MODEL_NOT_ALLOWED'::text;
    return;
  end if;

  select * into v_policy
    from private.workspace_ai_studio_policies
   where ws_id = p_ws_id;

  if p_idempotency_key is not null then
    select run.id
      into v_run_id
      from private.ai_studio_runs run
     where run.ws_id = p_ws_id
       and run.api_key_id is null
       and run.idempotency_key = p_idempotency_key
       and run.metadata ->> 'external_app_id' = p_external_app_id;

    if found then
      return query select true, v_run_id, null::text;
      return;
    end if;
  end if;

  v_effective_rpm := coalesce(v_policy.requests_per_minute, 10000);

  select count(*) into v_recent_requests
    from private.ai_studio_runs run
   where run.ws_id = p_ws_id
     and run.created_at >= now() - interval '1 minute';

  if v_recent_requests >= v_effective_rpm then
    return query select false, null::uuid, 'RATE_LIMIT_EXCEEDED'::text;
    return;
  end if;

  v_metadata := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'billing_mode', 'external_app_unmetered',
    'external_app_id', p_external_app_id
  );

  insert into private.ai_studio_runs (
    request_id,
    ws_id,
    api_key_id,
    actor_id,
    model_id,
    feature,
    reservation_id,
    reserved_credits,
    idempotency_key,
    metadata
  )
  values (
    p_request_id,
    p_ws_id,
    null,
    p_user_id,
    p_model_id,
    p_feature,
    null,
    0,
    p_idempotency_key,
    v_metadata
  )
  returning id into v_run_id;

  return query select true, v_run_id, null::text;
end;
$$;

create or replace function private.settle_external_ai_studio_run(
  p_run_id uuid,
  p_status text,
  p_provider_cost_usd numeric default 0,
  p_input_tokens integer default 0,
  p_output_tokens integer default 0,
  p_reasoning_tokens integer default 0,
  p_embedding_units integer default 0,
  p_image_units integer default 0,
  p_latency_ms integer default null,
  p_first_token_latency_ms integer default null,
  p_error_class text default null,
  p_error_message text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  success boolean,
  error_code text
)
language plpgsql
security definer
set search_path to private, public, pg_temp
as $$
declare
  v_run private.ai_studio_runs%rowtype;
begin
  if p_status not in ('succeeded', 'failed', 'aborted') then
    return query select false, 'INVALID_STATUS'::text;
    return;
  end if;

  select * into v_run
    from private.ai_studio_runs
   where id = p_run_id
   for update;

  if not found then
    return query select false, 'RUN_NOT_FOUND'::text;
    return;
  end if;

  if v_run.metadata ->> 'billing_mode'
      is distinct from 'external_app_unmetered'
    or v_run.api_key_id is not null
    or v_run.reservation_id is not null then
    return query select false, 'RUN_NOT_EXTERNAL_APP'::text;
    return;
  end if;

  if v_run.status in ('succeeded', 'failed', 'aborted') then
    return query select true, null::text;
    return;
  end if;

  update private.ai_studio_runs
     set status = p_status,
         billed_credits = 0,
         provider_cost_usd = greatest(coalesce(p_provider_cost_usd, 0), 0),
         input_tokens = greatest(coalesce(p_input_tokens, 0), 0),
         output_tokens = greatest(coalesce(p_output_tokens, 0), 0),
         reasoning_tokens = greatest(coalesce(p_reasoning_tokens, 0), 0),
         embedding_units = greatest(coalesce(p_embedding_units, 0), 0),
         image_units = greatest(coalesce(p_image_units, 0), 0),
         latency_ms = p_latency_ms,
         first_token_latency_ms = p_first_token_latency_ms,
         error_class = p_error_class,
         error_message = p_error_message,
         metadata = metadata || coalesce(p_metadata, '{}'::jsonb),
         completed_at = now()
   where id = p_run_id;

  insert into private.ai_studio_usage (
    run_id,
    ws_id,
    api_key_id,
    model_id,
    feature,
    billed_credits,
    provider_cost_usd,
    input_tokens,
    output_tokens,
    units
  )
  values (
    v_run.id,
    v_run.ws_id,
    null,
    v_run.model_id,
    v_run.feature,
    0,
    greatest(coalesce(p_provider_cost_usd, 0), 0),
    greatest(coalesce(p_input_tokens, 0), 0),
    greatest(coalesce(p_output_tokens, 0), 0),
    greatest(coalesce(p_embedding_units, 0), 0)
      + greatest(coalesce(p_image_units, 0), 0)
  )
  on conflict (run_id) do nothing;

  return query select true, null::text;
end;
$$;

create or replace function private.cleanup_ai_studio_retention()
returns table (content_rows_deleted bigint, metadata_rows_deleted bigint)
language plpgsql
security definer
set search_path to private, public, pg_temp
as $$
declare
  v_content bigint;
  v_metadata bigint;
  v_expired record;
begin
  for v_expired in
    select run.id as run_id,
           run.api_key_id,
           run.reserved_credits,
           reservation.balance_id
      from private.ai_studio_runs run
      join private.ai_credit_reservations reservation
        on reservation.id = run.reservation_id
     where run.status in ('reserved', 'running')
       and reservation.status = 'reserved'
       and reservation.expires_at <= now()
     for update of run, reservation
  loop
    perform public._release_expired_ai_credit_reservations(
      v_expired.balance_id
    );

    update private.ai_studio_runs
       set status = 'aborted',
           error_class = 'reservation_expired',
           error_message = 'The credit reservation expired before settlement.',
           completed_at = now()
     where id = v_expired.run_id
       and status in ('reserved', 'running');

    if v_expired.api_key_id is not null then
      update private.ai_studio_api_keys
         set credits_reserved = greatest(
               credits_reserved - v_expired.reserved_credits,
               0
             ),
             updated_at = now()
       where id = v_expired.api_key_id;
    end if;
  end loop;

  update private.ai_studio_runs
     set status = 'aborted',
         error_class = 'external_run_expired',
         error_message =
           'The external-app process ended before usage was settled.',
         completed_at = now()
   where status in ('reserved', 'running')
     and reservation_id is null
     and api_key_id is null
     and metadata ->> 'billing_mode' = 'external_app_unmetered'
     and created_at <= now() - interval '30 minutes';

  delete from private.ai_studio_run_content where expires_at <= now();
  get diagnostics v_content = row_count;

  delete from private.ai_studio_runs run
   using private.ai_studio_global_settings global_settings
   where global_settings.singleton
     and run.created_at < now() - make_interval(
       days => coalesce(
         (
           select policy.metadata_retention_days
             from private.workspace_ai_studio_policies policy
            where policy.ws_id = run.ws_id
         ),
         global_settings.metadata_retention_days
       )
     );
  get diagnostics v_metadata = row_count;

  return query select v_content, v_metadata;
end;
$$;

revoke all on function private.begin_external_ai_studio_run(
  text, uuid, uuid, text, text, text, text, jsonb
) from public, anon, authenticated;
revoke all on function private.settle_external_ai_studio_run(
  uuid, text, numeric, integer, integer, integer, integer, integer, integer,
  integer, text, text, jsonb
) from public, anon, authenticated;

grant execute on function private.begin_external_ai_studio_run(
  text, uuid, uuid, text, text, text, text, jsonb
) to service_role;
grant execute on function private.settle_external_ai_studio_run(
  uuid, text, numeric, integer, integer, integer, integer, integer, integer,
  integer, text, text, jsonb
) to service_role;

comment on function private.begin_external_ai_studio_run(
  text, uuid, uuid, text, text, text, text, jsonb
) is
  'Starts an audited, zero-credit AI Studio run for a verified registered external app.';
