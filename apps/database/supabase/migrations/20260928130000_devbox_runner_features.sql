-- Keep operator-selected runner features separate from heartbeat-reported capabilities.
alter table private.devbox_runners
    add column if not exists enabled_features jsonb not null default '{"run": true, "build": true, "serve": true, "tunnel": true, "judge": false}'::jsonb;

alter table private.devbox_runners
    add column if not exists resource_limits jsonb not null default '{"max_cpu_percent": 50, "max_memory_percent": 25, "max_sandboxes": 1, "max_instances": 1, "sandbox_memory_mb": 1024, "sandbox_timeout_seconds": 30, "sandbox_pids": 64}'::jsonb;

alter table private.devbox_runs
    add column if not exists workload text not null default 'run';

alter table private.devbox_runs
    add constraint devbox_runs_workload_check
    check (workload in ('run', 'build', 'serve', 'tunnel', 'maintenance', 'judge'));

create index if not exists idx_devbox_runs_workload_queue
    on private.devbox_runs(workload, created_at)
    where status = 'queued';

create or replace function private.set_devbox_runner_feature(
    p_runner_id uuid,
    p_feature text,
    p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
    v_features jsonb;
begin
    if p_feature not in ('run', 'build', 'serve', 'tunnel', 'judge') then
        raise exception 'Unsupported devbox feature: %', p_feature;
    end if;

    if p_feature = 'judge' and p_enabled and not exists (
        select 1 from private.devbox_runners
        where id = p_runner_id and status = 'online'
            and capabilities #>> '{judge,ready}' = 'true'
            and last_heartbeat_at > now() - interval '2 minutes'
    ) then
        raise exception 'Judge runner is not ready';
    end if;

    update private.devbox_runners
    set enabled_features = jsonb_set(
            enabled_features,
            array[p_feature],
            to_jsonb(p_enabled),
            true
        ),
        updated_at = now()
    where id = p_runner_id and status <> 'revoked'
    returning enabled_features into v_features;

    if v_features is null then
        raise exception 'Devbox runner not found or revoked';
    end if;

    return v_features;
end;
$$;

create table if not exists private.learn_coding_submissions (
    id uuid primary key default gen_random_uuid(),
    ws_id uuid not null,
    user_id uuid not null references public.users(id) on delete cascade,
    challenge_slug text not null,
    source text not null,
    run_id uuid not null unique references private.devbox_runs(id) on delete cascade,
    created_at timestamptz not null default now()
);

create index if not exists idx_learn_coding_submissions_user_workspace
    on private.learn_coding_submissions(user_id, ws_id, created_at desc);

alter table private.learn_coding_submissions enable row level security;
revoke all on private.learn_coding_submissions from public, anon, authenticated;
grant select, insert on private.learn_coding_submissions to service_role;

create or replace function private.enqueue_learn_coding_submission(
    p_ws_id uuid,
    p_user_id uuid,
    p_challenge_slug text,
    p_source text,
    p_command text[],
    p_language text
)
returns uuid
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
    v_submission_id uuid := gen_random_uuid();
    v_lease_id uuid := gen_random_uuid();
    v_run_id uuid := gen_random_uuid();
    v_runner_id uuid;
begin
    if p_challenge_slug !~ '^[a-z0-9-]{1,80}$'
        or length(p_source) > 16000
        or array_length(p_command, 1) <> 2
        or p_command[1] <> '__ttr_judge_v1__'
        or length(p_command[2]) > 48000
        or p_language not in ('python', 'javascript', 'typescript', 'c',
            'cpp', 'java', 'rust', 'go', 'ruby', 'php')
    then
        raise exception 'Invalid coding submission';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

    if (select count(*) from private.learn_coding_submissions
        where user_id = p_user_id and created_at > now() - interval '1 hour') >= 20
    then
        raise exception 'Coding submission rate limit exceeded';
    end if;

    select runner.id into v_runner_id
    from private.devbox_runners runner
    where runner.status = 'online'
        and runner.enabled_features ->> 'judge' = 'true'
        and runner.capabilities #>> '{judge,ready}' = 'true'
        and runner.capabilities #> '{judge,languages}' ? p_language
        and runner.last_heartbeat_at > now() - interval '2 minutes'
    order by (
        select count(*) from private.devbox_runs pending
        where pending.runner_id = runner.id
            and pending.status in ('queued', 'running')
    ), runner.last_heartbeat_at desc
    for update of runner skip locked
    limit 1;
    if v_runner_id is null then
        raise exception 'No ready Judge runner is available';
    end if;

    insert into private.devbox_leases (
        id, actor_id, runner_id, status, keep, expires_at
    ) values (
        v_lease_id, p_user_id, v_runner_id, 'active', false,
        now() + interval '30 minutes'
    );

    insert into private.devbox_runs (
        id, actor_id, lease_id, runner_id, status, workload, command,
        timeout_seconds
    ) values (
        v_run_id, p_user_id, v_lease_id, v_runner_id, 'queued', 'judge',
        p_command, 1500
    );

    insert into private.learn_coding_submissions (
        id, ws_id, user_id, challenge_slug, source, run_id
    ) values (
        v_submission_id, p_ws_id, p_user_id, p_challenge_slug, p_source,
        v_run_id
    );

    return v_submission_id;
end;
$$;

revoke all on function private.enqueue_learn_coding_submission(
    uuid, uuid, text, text, text[], text
) from public, anon, authenticated;
grant execute on function private.enqueue_learn_coding_submission(
    uuid, uuid, text, text, text[], text
) to service_role;

revoke all on function private.set_devbox_runner_feature(uuid, text, boolean)
    from public, anon, authenticated;
grant execute on function private.set_devbox_runner_feature(uuid, text, boolean)
    to service_role;

create or replace function private.set_devbox_runner_resource_limits(
    p_runner_id uuid,
    p_limits jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
    v_limits jsonb;
begin
    if jsonb_typeof(p_limits) <> 'object'
        or (select count(*) from jsonb_object_keys(p_limits)) <> 7
        or not (p_limits ?& array[
            'max_cpu_percent', 'max_memory_percent', 'max_sandboxes',
            'max_instances', 'sandbox_memory_mb', 'sandbox_timeout_seconds',
            'sandbox_pids'
        ])
        or jsonb_typeof(p_limits -> 'max_cpu_percent') <> 'number'
        or jsonb_typeof(p_limits -> 'max_memory_percent') <> 'number'
        or jsonb_typeof(p_limits -> 'max_sandboxes') <> 'number'
        or jsonb_typeof(p_limits -> 'max_instances') <> 'number'
        or jsonb_typeof(p_limits -> 'sandbox_memory_mb') <> 'number'
        or jsonb_typeof(p_limits -> 'sandbox_timeout_seconds') <> 'number'
        or jsonb_typeof(p_limits -> 'sandbox_pids') <> 'number'
    then
        raise exception 'Invalid devbox resource limits';
    end if;

    if (p_limits ->> 'max_cpu_percent')::integer not between 10 and 80
        or (p_limits ->> 'max_memory_percent')::integer not between 10 and 80
        or (p_limits ->> 'max_sandboxes')::integer not between 1 and 16
        or (p_limits ->> 'max_instances')::integer not between 1 and 8
        or (p_limits ->> 'sandbox_memory_mb')::integer not between 128 and 4096
        or (p_limits ->> 'sandbox_timeout_seconds')::integer not between 1 and 120
        or (p_limits ->> 'sandbox_pids')::integer not between 16 and 256
        or (select bool_or(value::numeric <> trunc(value::numeric))
            from jsonb_each_text(p_limits))
    then
        raise exception 'Devbox resource limits are out of range';
    end if;

    update private.devbox_runners
    set resource_limits = p_limits, updated_at = now()
    where id = p_runner_id and status <> 'revoked'
    returning resource_limits into v_limits;

    if v_limits is null then
        raise exception 'Devbox runner not found or revoked';
    end if;

    return v_limits;
end;
$$;

revoke all on function private.set_devbox_runner_resource_limits(uuid, jsonb)
    from public, anon, authenticated;
grant execute on function private.set_devbox_runner_resource_limits(uuid, jsonb)
    to service_role;

-- Keep the established claim result shape so existing agents remain compatible.
create or replace function private.claim_next_devbox_run(p_runner_id uuid)
returns table (
    id uuid,
    actor_id uuid,
    lease_id uuid,
    command text[],
    env jsonb,
    env_files text[],
    preview_ports integer[],
    timeout_seconds integer,
    created_at timestamptz,
    updated_at timestamptz
)
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
    return query
    with next_run as (
        select run.id
        from private.devbox_runs run
        join private.devbox_leases lease on lease.id = run.lease_id
        join private.devbox_runners runner on runner.id = p_runner_id
        where run.status = 'queued'
            and (run.runner_id is null or run.runner_id = p_runner_id)
            and (lease.runner_id is null or lease.runner_id = p_runner_id)
            and lease.status = 'active'
            and lease.expires_at > now()
            and runner.status = 'online'
            and (run.workload <> 'judge' or (
                run.command[1] = '__ttr_judge_v1__'
                and array_length(run.command, 1) = 2
                and coalesce(array_length(run.env_files, 1), 0) = 0
                and runner.capabilities #>> '{judge,ready}' = 'true'
            ))
            and (
                run.workload = 'maintenance'
                or coalesce((runner.enabled_features ->> run.workload)::boolean, false)
            )
        order by run.created_at
        for update of run skip locked
        limit 1
    ),
    claimed as (
        update private.devbox_runs run
        set runner_id = p_runner_id,
            status = 'running',
            started_at = coalesce(run.started_at, now()),
            updated_at = now()
        from next_run
        where run.id = next_run.id
        returning run.id, run.actor_id, run.lease_id, run.command, run.env,
            run.env_files, run.preview_ports, run.timeout_seconds,
            run.created_at, run.updated_at
    )
    select claimed.id, claimed.actor_id, claimed.lease_id, claimed.command,
        case when claimed.command[1] = '__ttr_judge_v1__'
            then claimed.env || jsonb_build_object(
                '__TTR_RESOURCE_LIMITS',
                (select config.resource_limits::text
                    from private.devbox_runners config
                    where config.id = p_runner_id)
            )
            else claimed.env end,
        claimed.env_files, claimed.preview_ports,
        claimed.timeout_seconds, claimed.created_at, claimed.updated_at
    from claimed;
end;
$$;
