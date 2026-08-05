-- Background workloads of a registered external app (CS35 scans, risk scoring,
-- article generation, embeddings, exports) have no browser session, so they
-- could not use the session-bound external-app path and fell back to calling
-- Google/OpenAI directly.
--
-- An AI Studio API key is already a proper machine credential: hashed secret,
-- prefix, expiry, revocation, rotation chain, per-key model allowlist, RPM cap
-- and last-used auditing. Binding a key to an external app lets those workers
-- authenticate without a user while keeping the same attribution and billing
-- treatment as the app's interactive traffic.

alter table private.ai_studio_api_keys
  add column if not exists external_app_id text
    check (
      external_app_id is null
      or external_app_id ~ '^[a-z0-9_-]{1,64}$'
    );

comment on column private.ai_studio_api_keys.external_app_id is
  'When set, this key authenticates a registered external app''s background '
  'workloads. Runs are attributed to the app and settle unmetered, matching the '
  'app''s session-bound traffic. Null keys keep ordinary workspace credit billing.';

create index if not exists ai_studio_api_keys_external_app_idx
  on private.ai_studio_api_keys (external_app_id, ws_id)
  where external_app_id is not null;

-- Accept an optional originating API key so machine-credential runs stay
-- traceable to the exact key (and therefore to a rotation or revocation), while
-- keeping session-bound external-app runs unchanged.
create or replace function private.begin_external_ai_studio_run(
  p_request_id text,
  p_ws_id uuid,
  p_user_id uuid,
  p_external_app_id text,
  p_model_id text,
  p_feature text,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_api_key_id uuid default null
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
  v_key private.ai_studio_api_keys%rowtype;
begin
  if p_external_app_id is null
    or p_external_app_id !~ '^[a-z0-9_-]{1,64}$' then
    return query select false, null::uuid, 'INVALID_EXTERNAL_APP'::text;
    return;
  end if;

  -- A supplied key must still be live and bound to this exact app and
  -- workspace, so a revoked or re-pointed key cannot keep spending unmetered.
  if p_api_key_id is not null then
    select * into v_key
      from private.ai_studio_api_keys
     where id = p_api_key_id;

    if not found
      or v_key.revoked_at is not null
      or (v_key.expires_at is not null and v_key.expires_at <= now())
      or v_key.ws_id <> p_ws_id
      or v_key.external_app_id is distinct from p_external_app_id then
      return query select false, null::uuid, 'INVALID_EXTERNAL_APP'::text;
      return;
    end if;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_ws_id::text || ':' || p_external_app_id, 0)
  );

  if not private.ai_studio_model_allowed(p_ws_id, p_api_key_id, p_model_id) then
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
       and run.idempotency_key = p_idempotency_key
       and run.metadata ->> 'external_app_id' = p_external_app_id
       and run.api_key_id is not distinct from p_api_key_id;

    if found then
      return query select true, v_run_id, null::text;
      return;
    end if;
  end if;

  v_effective_rpm := coalesce(
    case when p_api_key_id is not null then v_key.requests_per_minute end,
    v_policy.requests_per_minute,
    10000
  );

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
    'external_app_id', p_external_app_id,
    'execution_mode',
      case when p_api_key_id is null then 'interactive' else 'background' end
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
    p_api_key_id,
    p_user_id,
    p_model_id,
    p_feature,
    null,
    0,
    p_idempotency_key,
    v_metadata
  )
  returning id into v_run_id;

  if p_api_key_id is not null then
    update private.ai_studio_api_keys
       set last_used_at = now(),
           updated_at = now()
     where id = p_api_key_id;
  end if;

  return query select true, v_run_id, null::text;
end;
$$;

revoke all on function private.begin_external_ai_studio_run(
  text, uuid, uuid, text, text, text, text, jsonb, uuid
) from public, anon, authenticated;

grant execute on function private.begin_external_ai_studio_run(
  text, uuid, uuid, text, text, text, text, jsonb, uuid
) to service_role;

-- The eight-argument signature is replaced by the nine-argument one above.
drop function if exists private.begin_external_ai_studio_run(
  text, uuid, uuid, text, text, text, text, jsonb
);
