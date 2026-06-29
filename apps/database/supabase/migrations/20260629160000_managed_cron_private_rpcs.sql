-- Private managed-cron RPC surface.
-- apps/web uses these with the Supabase service role instead of opening a raw
-- Postgres connection from runtime/setup code.

create or replace function private.list_enabled_managed_cron_domains()
returns table(domain text)
language sql
security definer
set search_path = private, public, pg_temp
as $$
  select d.domain
  from private.managed_cron_whitelisted_domains d
  where d.enabled = true
  order by d.domain asc
$$;

create or replace function private.list_managed_cron_whitelisted_domains(
  p_limit integer default 10,
  p_offset integer default 0,
  p_search text default null
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_count integer;
  v_rows jsonb;
begin
  select count(*)::integer
  into v_count
  from private.managed_cron_whitelisted_domains d
  where p_search is null
    or d.domain ilike p_search;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'domain', domain,
        'description', description,
        'enabled', enabled,
        'created_at', created_at::text,
        'updated_at', updated_at::text,
        'created_by', created_by::text,
        'updated_by', updated_by::text
      )
      order by created_at desc
    ),
    '[]'::jsonb
  )
  into v_rows
  from (
    select *
    from private.managed_cron_whitelisted_domains d
    where p_search is null
      or d.domain ilike p_search
    order by d.created_at desc
    limit greatest(1, least(coalesce(p_limit, 10), 100))
    offset greatest(0, coalesce(p_offset, 0))
  ) rows;

  return jsonb_build_object('count', coalesce(v_count, 0), 'data', v_rows);
end;
$$;

create or replace function private.upsert_managed_cron_whitelisted_domain(
  p_domain text,
  p_description text default null,
  p_enabled boolean default true,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_row private.managed_cron_whitelisted_domains%rowtype;
begin
  insert into private.managed_cron_whitelisted_domains (
    domain,
    description,
    enabled,
    created_by,
    updated_by
  )
  values (
    lower(trim(p_domain)),
    p_description,
    coalesce(p_enabled, true),
    p_actor_id,
    p_actor_id
  )
  on conflict (domain)
  do update set
    description = coalesce(excluded.description, private.managed_cron_whitelisted_domains.description),
    enabled = excluded.enabled,
    updated_at = now(),
    updated_by = excluded.updated_by
  returning *
  into v_row;

  return jsonb_build_object(
    'domain', v_row.domain,
    'description', v_row.description,
    'enabled', v_row.enabled,
    'created_at', v_row.created_at::text,
    'updated_at', v_row.updated_at::text,
    'created_by', v_row.created_by::text,
    'updated_by', v_row.updated_by::text
  );
end;
$$;

create or replace function private.update_managed_cron_whitelisted_domain_enabled(
  p_domain text,
  p_enabled boolean,
  p_actor_id uuid default null
)
returns void
language sql
security definer
set search_path = private, public, pg_temp
as $$
  update private.managed_cron_whitelisted_domains
  set
    enabled = p_enabled,
    updated_at = now(),
    updated_by = p_actor_id
  where domain = lower(trim(p_domain))
$$;

create or replace function private.delete_managed_cron_whitelisted_domain(
  p_domain text
)
returns void
language sql
security definer
set search_path = private, public, pg_temp
as $$
  delete from private.managed_cron_whitelisted_domains
  where domain = lower(trim(p_domain))
$$;

create or replace function private.managed_cron_claim_due_jobs(
  p_limit integer default 25,
  p_runner_id text default null,
  p_lock_ttl_seconds integer default 600
)
returns table(
  id text,
  ws_id text,
  name text,
  schedule text,
  active boolean,
  endpoint_url text,
  http_method text,
  headers_config jsonb,
  timeout_ms integer,
  retry_count integer
)
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  return query
  with due_jobs as (
    select j.id
    from public.workspace_cron_jobs j
    where
      j.active = true
      and j.endpoint_url is not null
      and length(trim(j.endpoint_url)) > 0
      and (j.next_run_at is null or j.next_run_at <= now())
      and (
        j.locked_at is null
        or j.locked_at < now() - make_interval(secs => greatest(1, coalesce(p_lock_ttl_seconds, 600)))
      )
      and exists (
        select 1
        from public.workspace_secrets s
        where
          s.ws_id = j.ws_id
          and s.name = 'MANAGED_CRON_ENABLED'
          and lower(trim(coalesce(s.value, ''))) = 'true'
      )
    order by j.next_run_at nulls first, j.created_at asc
    limit greatest(1, least(coalesce(p_limit, 25), 100))
    for update skip locked
  )
  update public.workspace_cron_jobs j
  set
    locked_at = now(),
    locked_by = coalesce(nullif(p_runner_id, ''), 'apps-web-managed-cron')
  from due_jobs
  where j.id = due_jobs.id
  returning
    j.id::text,
    j.ws_id::text,
    j.name,
    j.schedule,
    j.active,
    j.endpoint_url,
    j.http_method,
    j.headers_config,
    j.timeout_ms,
    j.retry_count;
end;
$$;

create or replace function private.managed_cron_claim_external_job(
  p_ws_id uuid,
  p_external_app_id text,
  p_external_job_key text,
  p_runner_id text
)
returns table(
  id text,
  ws_id text,
  name text,
  schedule text,
  active boolean,
  endpoint_url text,
  http_method text,
  headers_config jsonb,
  timeout_ms integer,
  retry_count integer
)
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  return query
  update public.workspace_cron_jobs j
  set
    locked_at = now(),
    locked_by = coalesce(nullif(p_runner_id, ''), 'apps-web-external-cron')
  where j.id = (
    select candidate.id
    from public.workspace_cron_jobs candidate
    where candidate.ws_id = p_ws_id
      and candidate.external_app_id = p_external_app_id
      and candidate.external_job_key = p_external_job_key
    limit 1
  )
  returning
    j.id::text,
    j.ws_id::text,
    j.name,
    j.schedule,
    j.active,
    j.endpoint_url,
    j.http_method,
    j.headers_config,
    j.timeout_ms,
    j.retry_count;
end;
$$;

create or replace function private.managed_cron_load_secret_values(
  p_ws_id uuid,
  p_secret_names text[]
)
returns table(name text, value text)
language sql
security definer
set search_path = private, public, pg_temp
as $$
  select s.name, s.value
  from public.workspace_secrets s
  where s.ws_id = p_ws_id
    and s.name = any(coalesce(p_secret_names, array[]::text[]))
$$;

create or replace function private.managed_cron_record_execution(
  p_job_id uuid,
  p_runner_id text,
  p_status text,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_response text default null,
  p_http_status integer default null,
  p_duration_ms integer default null,
  p_error text default null,
  p_endpoint_url text default null,
  p_next_run_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  insert into public.workspace_cron_executions (
    id,
    job_id,
    status,
    start_time,
    end_time,
    response,
    http_status,
    duration_ms,
    error,
    endpoint_url
  )
  values (
    gen_random_uuid(),
    p_job_id,
    p_status,
    p_start_time,
    p_end_time,
    p_response,
    p_http_status,
    greatest(0, coalesce(p_duration_ms, 0)),
    p_error,
    p_endpoint_url
  );

  update public.workspace_cron_jobs
  set
    next_run_at = p_next_run_at,
    last_run_at = p_end_time,
    locked_at = null,
    locked_by = null,
    failure_count = case
      when p_status = 'success' then 0
      else failure_count + 1
    end,
    last_status = p_status
  where id = p_job_id
    and locked_by = p_runner_id;

  return true;
end;
$$;

create or replace function private.external_app_managed_cron_status(
  p_ws_id uuid,
  p_external_app_id text,
  p_expected_job_count integer default 0,
  p_enabled_secret text default 'MANAGED_CRON_ENABLED',
  p_token_secret text default 'EXTERNAL_APP_MANAGED_CRON_TOKEN'
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_enabled boolean;
  v_jobs jsonb;
  v_token_configured boolean;
begin
  select exists (
    select 1
    from public.workspace_secrets s
    where s.ws_id = p_ws_id
      and s.name = p_enabled_secret
      and lower(trim(coalesce(s.value, ''))) = 'true'
  )
  into v_enabled;

  select exists (
    select 1
    from public.workspace_secrets s
    where s.ws_id = p_ws_id
      and s.name = p_token_secret
      and length(trim(coalesce(s.value, ''))) > 0
  )
  into v_token_configured;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'active', j.active,
        'failureCount', j.failure_count,
        'jobKey', j.external_job_key,
        'lastRunAt', j.last_run_at::text,
        'lastStatus', j.last_status,
        'name', j.name,
        'nextRunAt', j.next_run_at::text,
        'schedule', j.schedule
      )
      order by j.external_job_key asc
    ),
    '[]'::jsonb
  )
  into v_jobs
  from public.workspace_cron_jobs j
  where j.ws_id = p_ws_id
    and j.external_app_id = p_external_app_id
    and j.external_job_key is not null;

  return jsonb_build_object(
    'configured',
    coalesce(v_token_configured, false)
      and jsonb_array_length(v_jobs) >= greatest(0, coalesce(p_expected_job_count, 0)),
    'enabled',
    coalesce(v_enabled, false),
    'jobs',
    v_jobs
  );
end;
$$;

create or replace function private.external_app_managed_cron_setup(
  p_ws_id uuid,
  p_external_app_id text,
  p_enabled_secret text,
  p_token_secret text,
  p_token_value text,
  p_jobs jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_job jsonb;
begin
  delete from public.workspace_secrets
  where ws_id = p_ws_id
    and name in (p_enabled_secret, p_token_secret);

  insert into public.workspace_secrets (ws_id, name, value)
  values
    (p_ws_id, p_enabled_secret, 'true'),
    (p_ws_id, p_token_secret, p_token_value);

  for v_job in
    select value
    from jsonb_array_elements(coalesce(p_jobs, '[]'::jsonb))
  loop
    insert into public.workspace_cron_jobs (
      ws_id,
      name,
      dataset_id,
      schedule,
      active,
      endpoint_url,
      http_method,
      headers_config,
      timeout_ms,
      retry_count,
      next_run_at,
      external_app_id,
      external_job_key
    )
    values (
      p_ws_id,
      v_job->>'name',
      null,
      v_job->>'schedule',
      true,
      v_job->>'endpointUrl',
      'POST',
      coalesce(v_job->'headersConfig', '[]'::jsonb),
      coalesce((v_job->>'timeoutMs')::integer, 15000),
      coalesce((v_job->>'retryCount')::integer, 1),
      nullif(v_job->>'nextRunAt', '')::timestamptz,
      p_external_app_id,
      v_job->>'jobKey'
    )
    on conflict (ws_id, external_app_id, external_job_key)
    where external_app_id is not null
      and external_job_key is not null
    do update set
      name = excluded.name,
      schedule = excluded.schedule,
      active = true,
      endpoint_url = excluded.endpoint_url,
      http_method = excluded.http_method,
      headers_config = excluded.headers_config,
      timeout_ms = excluded.timeout_ms,
      retry_count = excluded.retry_count,
      next_run_at = coalesce(public.workspace_cron_jobs.next_run_at, excluded.next_run_at);
  end loop;

  return private.external_app_managed_cron_status(
    p_ws_id,
    p_external_app_id,
    jsonb_array_length(coalesce(p_jobs, '[]'::jsonb)),
    p_enabled_secret,
    p_token_secret
  );
end;
$$;

create or replace function private.external_app_managed_cron_update_job(
  p_ws_id uuid,
  p_external_app_id text,
  p_external_job_key text,
  p_enabled boolean,
  p_next_run_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_updated boolean := false;
begin
  update public.workspace_cron_jobs
  set
    active = coalesce(p_enabled, false),
    next_run_at = case
      when coalesce(p_enabled, false) then coalesce(next_run_at, p_next_run_at)
      else next_run_at
    end
  where ws_id = p_ws_id
    and external_app_id = p_external_app_id
    and external_job_key = p_external_job_key
  returning true
  into v_updated;

  return coalesce(v_updated, false);
end;
$$;

revoke all on function private.list_enabled_managed_cron_domains() from public, anon, authenticated;
revoke all on function private.list_managed_cron_whitelisted_domains(integer, integer, text) from public, anon, authenticated;
revoke all on function private.upsert_managed_cron_whitelisted_domain(text, text, boolean, uuid) from public, anon, authenticated;
revoke all on function private.update_managed_cron_whitelisted_domain_enabled(text, boolean, uuid) from public, anon, authenticated;
revoke all on function private.delete_managed_cron_whitelisted_domain(text) from public, anon, authenticated;
revoke all on function private.managed_cron_claim_due_jobs(integer, text, integer) from public, anon, authenticated;
revoke all on function private.managed_cron_claim_external_job(uuid, text, text, text) from public, anon, authenticated;
revoke all on function private.managed_cron_load_secret_values(uuid, text[]) from public, anon, authenticated;
revoke all on function private.managed_cron_record_execution(uuid, text, text, timestamptz, timestamptz, text, integer, integer, text, text, timestamptz) from public, anon, authenticated;
revoke all on function private.external_app_managed_cron_status(uuid, text, integer, text, text) from public, anon, authenticated;
revoke all on function private.external_app_managed_cron_setup(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function private.external_app_managed_cron_update_job(uuid, text, text, boolean, timestamptz) from public, anon, authenticated;

grant execute on function private.list_enabled_managed_cron_domains() to service_role;
grant execute on function private.list_managed_cron_whitelisted_domains(integer, integer, text) to service_role;
grant execute on function private.upsert_managed_cron_whitelisted_domain(text, text, boolean, uuid) to service_role;
grant execute on function private.update_managed_cron_whitelisted_domain_enabled(text, boolean, uuid) to service_role;
grant execute on function private.delete_managed_cron_whitelisted_domain(text) to service_role;
grant execute on function private.managed_cron_claim_due_jobs(integer, text, integer) to service_role;
grant execute on function private.managed_cron_claim_external_job(uuid, text, text, text) to service_role;
grant execute on function private.managed_cron_load_secret_values(uuid, text[]) to service_role;
grant execute on function private.managed_cron_record_execution(uuid, text, text, timestamptz, timestamptz, text, integer, integer, text, text, timestamptz) to service_role;
grant execute on function private.external_app_managed_cron_status(uuid, text, integer, text, text) to service_role;
grant execute on function private.external_app_managed_cron_setup(uuid, text, text, text, text, jsonb) to service_role;
grant execute on function private.external_app_managed_cron_update_job(uuid, text, text, boolean, timestamptz) to service_role;
