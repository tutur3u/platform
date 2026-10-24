-- Devbox trust pools and drain (S2 + S3).
--
-- S2: new runners start with every feature off; trusted workloads
-- (run/build/serve/tunnel) and untrusted Judge/playground work cannot be
-- enabled on the same runner identity. Existing rows are unchanged.
-- S3: an operator drain stops new claims on a runner, requeues its queued
-- Judge work to other eligible runners, cancels other queued work pinned to
-- it, releases its idle leases, and exposes uncapped per-runner activity so
-- "drained" is observable.

alter table private.devbox_runners
    alter column enabled_features set default
    '{"run": false, "build": false, "serve": false, "tunnel": false, "judge": false, "playground": false}'::jsonb;

alter table private.devbox_runners
    add column if not exists drain_requested_at timestamptz;

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
    if p_feature not in ('run', 'build', 'serve', 'tunnel', 'judge', 'playground') then
        raise exception 'Unsupported devbox feature: %', p_feature;
    end if;

    -- Trust tiers are separate runner identities: untrusted Judge/playground
    -- code must never share a runner with trusted workloads and credentials.
    -- A self-reported executionMode can only narrow what may be enabled.
    if p_enabled and p_feature in ('run', 'build', 'serve', 'tunnel') and exists (
        select 1 from private.devbox_runners
        where id = p_runner_id
            and (enabled_features ->> 'judge' = 'true'
                or enabled_features ->> 'playground' = 'true'
                or capabilities ->> 'executionMode' = 'judge-only')
    ) then
        raise exception 'Trusted workloads require a runner identity separate from Judge and playground';
    end if;

    if p_enabled and p_feature in ('judge', 'playground') and exists (
        select 1 from private.devbox_runners
        where id = p_runner_id
            and (enabled_features ->> 'run' = 'true'
                or enabled_features ->> 'build' = 'true'
                or enabled_features ->> 'serve' = 'true'
                or enabled_features ->> 'tunnel' = 'true'
                or capabilities ->> 'executionMode' = 'trusted')
    ) then
        raise exception 'Judge and playground require a runner identity separate from trusted workloads';
    end if;

    if p_feature = 'judge' and p_enabled and not exists (
        select 1 from private.devbox_runners
        where id = p_runner_id and status = 'online'
            and capabilities #>> '{judge,ready}' = 'true'
            and last_heartbeat_at > now() - interval '2 minutes'
    ) then
        raise exception 'Judge runner is not ready';
    end if;

    if p_enabled and p_feature in ('judge','playground') and exists (select 1 from private.devbox_runners where id=p_runner_id and enabled_features->>case when p_feature='judge' then 'playground' else 'judge' end='true') then
        raise exception 'Judge and playground require separate runner pools';
    end if;
    if p_feature='playground' and p_enabled and not exists(select 1 from private.devbox_runners where id=p_runner_id and status='online' and capabilities#>>'{playground,ready}'='true' and last_heartbeat_at>now()-interval '90 seconds') then
        raise exception 'Playground runner is not ready';
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
    -- Serialize claims sharing one runner token before checking its capacity.
    perform pg_advisory_xact_lock(hashtextextended(p_runner_id::text, 1));
    return query
    with next_run as (
        select run.id
        from private.devbox_runs run
        join private.devbox_leases lease on lease.id = run.lease_id
        join private.devbox_runners runner on runner.id = p_runner_id
        where run.status = 'queued'
            and (
                (
                    (run.runner_id is null or run.runner_id = p_runner_id)
                    and (lease.runner_id is null or lease.runner_id = p_runner_id)
                )
                -- Queued Judge work pinned to a draining runner is requeued to
                -- any other eligible Judge runner (checked below as usual).
                or (
                    run.workload = 'judge'
                    and (run.runner_id is null or run.runner_id in (
                        select draining.id from private.devbox_runners draining
                        where draining.drain_requested_at is not null))
                    and (lease.runner_id is null or lease.runner_id in (
                        select draining.id from private.devbox_runners draining
                        where draining.drain_requested_at is not null))
                )
            )
            -- A draining runner finishes in-flight work and accepts only
            -- maintenance (restart/upgrade); it claims nothing else.
            and (runner.drain_requested_at is null or run.workload = 'maintenance')
            and lease.status = 'active'
            and lease.expires_at > now()
            and runner.status = 'online'
            and runner.heartbeat_enabled
            and runner.last_heartbeat_at > now() - interval '90 seconds'
            and (run.workload <> 'playground' or (
                run.command[1] = '__ttr_playground_v1__' and cardinality(run.command) = 2
                and coalesce(cardinality(run.env_files),0) = 0
                and runner.capabilities #>> '{playground,ready}' = 'true'
                and exists (select 1 from private.learn_playground_runs j where j.run_id = run.id)
                and (private.account_playgrounds_allowed(run.actor_id) or exists(select 1 from private.learn_playground_runs elevated where elevated.run_id=run.id and private.meeting_programming_elevated(elevated.meeting_id,run.actor_id)))
            ))
            and (run.workload not in ('judge','playground') or exists(select 1 from private.learn_playground_runs control where control.run_id=run.id and control.operation in ('preview','stop')) or (
                select count(*) from private.devbox_runs active
                where active.runner_id = p_runner_id
                    and active.workload in ('judge','playground')
                    and active.status in ('running','cancel_requested')
            ) < least(
                (runner.resource_limits ->> 'max_sandboxes')::integer,
                (runner.resource_limits ->> 'max_instances')::integer
            ))
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
    ),
    moved_lease as (
        -- Requeued Judge work moves its lease to the claiming runner so the
        -- draining runner's activity reaches zero.
        update private.devbox_leases lease
        set runner_id = p_runner_id,
            updated_at = now()
        from claimed
        where lease.id = claimed.lease_id
            and lease.runner_id is not null
            and lease.runner_id <> p_runner_id
        returning lease.id
    )
    select claimed.id, claimed.actor_id, claimed.lease_id, claimed.command,
        case when claimed.command[1] in ('__ttr_judge_v1__','__ttr_playground_v1__')
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

create or replace function private.set_devbox_runner_drain(
    p_runner_id uuid,
    p_draining boolean
)
returns timestamptz
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
    v_drain timestamptz;
begin
    update private.devbox_runners
    set drain_requested_at = case
            when p_draining then coalesce(drain_requested_at, now())
            else null
        end,
        updated_at = now()
    where id = p_runner_id and status <> 'revoked'
    returning drain_requested_at into v_drain;

    if not found then
        raise exception 'Devbox runner not found or revoked';
    end if;

    if p_draining then
        -- Judge work is requeued at claim time. Other queued work pinned to
        -- this runner (explicit --runner pins, playground environments)
        -- cannot move safely, so it is cancelled with an explanation.
        with cancelled as (
            update private.devbox_runs run
            set status = 'cancelled',
                completed_at = now(),
                updated_at = now()
            where run.status = 'queued'
                and run.workload not in ('judge', 'maintenance')
                and (
                    run.runner_id = p_runner_id
                    or exists (
                        select 1 from private.devbox_leases lease
                        where lease.id = run.lease_id
                            and lease.runner_id = p_runner_id
                    )
                )
            returning run.id
        )
        insert into private.devbox_run_events (run_id, event_type, message)
        select cancelled.id, 'error',
            'Runner is draining; this queued run was cancelled. Submit it again.'
        from cancelled;

        update private.devbox_leases lease
        set status = 'released',
            released_at = now(),
            updated_at = now()
        where lease.runner_id = p_runner_id
            and lease.status = 'active'
            and not lease.keep
            and not exists (
                select 1 from private.devbox_runs run
                where run.lease_id = lease.id
                    and run.status in ('queued', 'claimed', 'running', 'cancel_requested')
            );
    end if;

    return v_drain;
end;
$$;

-- Uncapped per-runner counts; the admin snapshot lists are capped at 50 rows.
create or replace function private.devbox_runner_activity()
returns table (
    runner_id uuid,
    queued_runs bigint,
    running_runs bigint,
    active_leases bigint
)
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
    select runner.id,
        (select count(*) from private.devbox_runs run
            where run.status = 'queued'
                and (run.runner_id = runner.id or exists (
                    select 1 from private.devbox_leases lease
                    where lease.id = run.lease_id and lease.runner_id = runner.id))),
        (select count(*) from private.devbox_runs run
            where run.runner_id = runner.id
                and run.status in ('claimed', 'running', 'cancel_requested')),
        (select count(*) from private.devbox_leases lease
            where lease.runner_id = runner.id and lease.status = 'active')
    from private.devbox_runners runner
    where runner.status <> 'revoked';
$$;

revoke all on function private.set_devbox_runner_drain(uuid, boolean) from public, anon, authenticated;
grant execute on function private.set_devbox_runner_drain(uuid, boolean) to service_role;
revoke all on function private.devbox_runner_activity() from public, anon, authenticated;
grant execute on function private.devbox_runner_activity() to service_role;
