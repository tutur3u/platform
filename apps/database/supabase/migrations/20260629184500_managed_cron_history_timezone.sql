-- Managed cron history, timezone, and external-app schedule editing support.

alter table public.workspace_cron_jobs
  add column if not exists schedule_timezone text not null default 'UTC';

alter table public.workspace_cron_executions
  add column if not exists source text not null default 'scheduled';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_cron_jobs_schedule_timezone_check'
      and conrelid = 'public.workspace_cron_jobs'::regclass
  ) then
    alter table public.workspace_cron_jobs
      add constraint workspace_cron_jobs_schedule_timezone_check
      check (length(trim(schedule_timezone)) between 1 and 128);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_cron_executions_source_check'
      and conrelid = 'public.workspace_cron_executions'::regclass
  ) then
    alter table public.workspace_cron_executions
      add constraint workspace_cron_executions_source_check
      check (source in ('manual', 'scheduled'));
  end if;
end $$;

create index if not exists workspace_cron_executions_job_start_time_idx
  on public.workspace_cron_executions (job_id, start_time desc);

create index if not exists workspace_cron_executions_source_idx
  on public.workspace_cron_executions (source);

drop function if exists private.managed_cron_claim_due_jobs(integer, text, integer);
drop function if exists private.managed_cron_claim_external_job(uuid, text, text, text);
drop function if exists private.managed_cron_record_execution(uuid, text, text, timestamptz, timestamptz, text, integer, integer, text, text, timestamptz);
drop function if exists private.external_app_managed_cron_status(uuid, text, integer, text, text);
drop function if exists private.external_app_managed_cron_setup(uuid, text, text, text, text, jsonb);
drop function if exists private.external_app_managed_cron_update_job(uuid, text, text, boolean, timestamptz);
drop function if exists private.external_app_managed_cron_executions(uuid, text, text, integer, integer);
drop function if exists private.external_app_managed_cron_monitoring(integer);

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
  schedule_timezone text,
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
    coalesce(nullif(j.schedule_timezone, ''), 'UTC'),
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
  schedule_timezone text,
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
    coalesce(nullif(j.schedule_timezone, ''), 'UTC'),
    j.active,
    j.endpoint_url,
    j.http_method,
    j.headers_config,
    j.timeout_ms,
    j.retry_count;
end;
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
  p_next_run_at timestamptz default null,
  p_source text default 'scheduled'
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
    endpoint_url,
    source
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
    p_endpoint_url,
    case when p_source = 'manual' then 'manual' else 'scheduled' end
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
  v_generated_at timestamptz := now();
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
        'active', row.active,
        'failureCount', row.failure_count,
        'isOverdue', row.is_overdue,
        'jobId', row.id::text,
        'jobKey', row.external_job_key,
        'lastExecution', row.last_execution,
        'lastRunAt', row.last_run_at::text,
        'lastStatus', row.last_status,
        'name', row.name,
        'nextRunAt', row.next_run_at::text,
        'overdueReason', row.overdue_reason,
        'overdueSince', row.overdue_since,
        'schedule', row.schedule,
        'scheduleTimezone', row.schedule_timezone
      )
      order by row.external_job_key asc
    ),
    '[]'::jsonb
  )
  into v_jobs
  from (
    select
      j.*,
      coalesce(nullif(j.schedule_timezone, ''), 'UTC') as schedule_timezone,
      case
        when latest.id is null then null
        else jsonb_build_object(
          'durationMs', latest.duration_ms,
          'endedAt', latest.end_time::text,
          'error', latest.error,
          'httpStatus', latest.http_status,
          'id', latest.id::text,
          'response', latest.response,
          'source', latest.source,
          'startedAt', latest.start_time::text,
          'status', latest.status
        )
      end as last_execution,
      (
        j.active = true
        and j.next_run_at is not null
        and j.next_run_at < v_generated_at - interval '90 seconds'
      ) as is_overdue,
      case
        when j.active = true
          and j.next_run_at is not null
          and j.next_run_at < v_generated_at - interval '90 seconds'
        then j.next_run_at::text
        else null
      end as overdue_since,
      case
        when j.active = true
          and j.next_run_at is not null
          and j.next_run_at < v_generated_at - interval '90 seconds'
          and (latest.end_time is null or latest.end_time < j.next_run_at)
        then 'No execution recorded after scheduled time.'
        when j.active = true
          and j.next_run_at is not null
          and j.next_run_at < v_generated_at - interval '90 seconds'
        then 'Cron status is stale; next run is in the past.'
        else null
      end as overdue_reason
    from public.workspace_cron_jobs j
    left join lateral (
      select e.*
      from public.workspace_cron_executions e
      where e.job_id = j.id
      order by e.start_time desc
      limit 1
    ) latest on true
    where j.ws_id = p_ws_id
      and j.external_app_id = p_external_app_id
      and j.external_job_key is not null
  ) row;

  return jsonb_build_object(
    'configured',
    coalesce(v_token_configured, false)
      and jsonb_array_length(v_jobs) >= greatest(0, coalesce(p_expected_job_count, 0)),
    'enabled',
    coalesce(v_enabled, false),
    'generatedAt',
    v_generated_at::text,
    'jobs',
    v_jobs,
    'serverNow',
    v_generated_at::text
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
      schedule_timezone,
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
      coalesce(nullif(v_job->>'scheduleTimezone', ''), 'UTC'),
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
      schedule_timezone = excluded.schedule_timezone,
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
  p_enabled boolean default null,
  p_schedule text default null,
  p_schedule_timezone text default null,
  p_next_run_at timestamptz default null
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
    active = coalesce(p_enabled, active),
    schedule = coalesce(nullif(p_schedule, ''), schedule),
    schedule_timezone = coalesce(nullif(p_schedule_timezone, ''), schedule_timezone, 'UTC'),
    next_run_at = case
      when p_next_run_at is not null then p_next_run_at
      when coalesce(p_enabled, active) = true and next_run_at is null then now()
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

create or replace function private.external_app_managed_cron_executions(
  p_ws_id uuid,
  p_external_app_id text,
  p_external_job_key text default null,
  p_limit integer default 25,
  p_offset integer default 0
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
  from public.workspace_cron_executions e
  join public.workspace_cron_jobs j on j.id = e.job_id
  where j.ws_id = p_ws_id
    and j.external_app_id = p_external_app_id
    and (p_external_job_key is null or j.external_job_key = p_external_job_key);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'durationMs', e.duration_ms,
        'endedAt', e.end_time::text,
        'error', e.error,
        'httpStatus', e.http_status,
        'id', e.id::text,
        'jobId', j.id::text,
        'jobKey', j.external_job_key,
        'jobName', j.name,
        'response', e.response,
        'source', e.source,
        'startedAt', e.start_time::text,
        'status', e.status
      )
      order by e.start_time desc
    ),
    '[]'::jsonb
  )
  into v_rows
  from (
    select e.*
    from public.workspace_cron_executions e
    join public.workspace_cron_jobs j on j.id = e.job_id
    where j.ws_id = p_ws_id
      and j.external_app_id = p_external_app_id
      and (p_external_job_key is null or j.external_job_key = p_external_job_key)
    order by e.start_time desc
    limit greatest(1, least(coalesce(p_limit, 25), 100))
    offset greatest(0, coalesce(p_offset, 0))
  ) e
  join public.workspace_cron_jobs j on j.id = e.job_id;

  return jsonb_build_object(
    'items',
    v_rows,
    'limit',
    greatest(1, least(coalesce(p_limit, 25), 100)),
    'offset',
    greatest(0, coalesce(p_offset, 0)),
    'total',
    coalesce(v_count, 0)
  );
end;
$$;

create or replace function private.external_app_managed_cron_monitoring(
  p_execution_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_apps jsonb;
  v_executions jsonb;
  v_now timestamptz := now();
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'externalAppId', status_rows.external_app_id,
        'workspaceId', status_rows.ws_id::text,
        'status', status_rows.status
      )
      order by status_rows.external_app_id asc, status_rows.ws_id::text asc
    ),
    '[]'::jsonb
  )
  into v_apps
  from (
    select
      pairs.external_app_id,
      pairs.ws_id,
      private.external_app_managed_cron_status(
        pairs.ws_id,
        pairs.external_app_id,
        120,
        '',
        ''
      ) as status
    from (
      select distinct j.external_app_id, j.ws_id
      from public.workspace_cron_jobs j
      where j.external_app_id is not null
        and j.external_job_key is not null
    ) pairs
  ) status_rows;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'durationMs', rows.duration_ms,
        'endedAt', rows.end_time::text,
        'error', rows.error,
        'externalAppId', rows.external_app_id,
        'httpStatus', rows.http_status,
        'id', rows.id::text,
        'jobKey', rows.external_job_key,
        'jobName', rows.name,
        'responseSummary', rows.response,
        'source', rows.source,
        'startedAt', rows.start_time::text,
        'status', rows.status,
        'workspaceId', rows.ws_id::text
      )
      order by rows.start_time desc
    ),
    '[]'::jsonb
  )
  into v_executions
  from (
    select
      e.duration_ms,
      e.end_time,
      e.error,
      e.http_status,
      e.id,
      e.response,
      e.source,
      e.start_time,
      e.status,
      j.external_app_id,
      j.external_job_key,
      j.name,
      j.ws_id
    from public.workspace_cron_executions e
    join public.workspace_cron_jobs j on j.id = e.job_id
    where j.external_app_id is not null
      and j.external_job_key is not null
    order by e.start_time desc
    limit greatest(1, least(coalesce(p_execution_limit, 50), 100))
  ) rows;

  return jsonb_build_object(
    'apps',
    v_apps,
    'available',
    true,
    'error',
    null,
    'executions',
    v_executions,
    'generatedAt',
    v_now::text,
    'serverNow',
    v_now::text
  );
end;
$$;

revoke all on function private.managed_cron_claim_due_jobs(integer, text, integer) from public, anon, authenticated;
revoke all on function private.managed_cron_claim_external_job(uuid, text, text, text) from public, anon, authenticated;
revoke all on function private.managed_cron_record_execution(uuid, text, text, timestamptz, timestamptz, text, integer, integer, text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function private.external_app_managed_cron_status(uuid, text, integer, text, text) from public, anon, authenticated;
revoke all on function private.external_app_managed_cron_setup(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function private.external_app_managed_cron_update_job(uuid, text, text, boolean, text, text, timestamptz) from public, anon, authenticated;
revoke all on function private.external_app_managed_cron_executions(uuid, text, text, integer, integer) from public, anon, authenticated;
revoke all on function private.external_app_managed_cron_monitoring(integer) from public, anon, authenticated;

grant execute on function private.managed_cron_claim_due_jobs(integer, text, integer) to service_role;
grant execute on function private.managed_cron_claim_external_job(uuid, text, text, text) to service_role;
grant execute on function private.managed_cron_record_execution(uuid, text, text, timestamptz, timestamptz, text, integer, integer, text, text, timestamptz, text) to service_role;
grant execute on function private.external_app_managed_cron_status(uuid, text, integer, text, text) to service_role;
grant execute on function private.external_app_managed_cron_setup(uuid, text, text, text, text, jsonb) to service_role;
grant execute on function private.external_app_managed_cron_update_job(uuid, text, text, boolean, text, text, timestamptz) to service_role;
grant execute on function private.external_app_managed_cron_executions(uuid, text, text, integer, integer) to service_role;
grant execute on function private.external_app_managed_cron_monitoring(integer) to service_role;
