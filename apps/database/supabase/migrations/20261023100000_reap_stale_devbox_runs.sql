-- Fail devbox runs that can no longer finish so they stop holding runner
-- capacity (Judge/playground max_sandboxes) and playground busy checks.
-- A run is stale when:
--   * cancel_requested was not acknowledged within 10 minutes;
--   * started_at + timeout_seconds + 5 minutes has passed; or
--   * it started over 10 minutes ago on a runner that is missing, revoked, or
--     has not heartbeated for 10 minutes.
-- Each call handles at most p_limit runs (capped at 500) and skips locked
-- rows, so concurrent claims and sweeps never wait on each other. Re-running
-- is idempotent: reaped runs are terminal and drop out of the candidate set.
create index if not exists idx_devbox_runs_active_updated
    on private.devbox_runs(updated_at)
    where status in ('running', 'cancel_requested');

create or replace function private.reap_stale_devbox_runs(
    p_runner_id uuid default null,
    p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
    v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
    v_count integer;
begin
    with candidates as (
        select run.id, run.status,
            case
                when run.status = 'cancel_requested'
                    and run.updated_at < now() - interval '10 minutes'
                    then 'cancel_unacknowledged'
                when run.timeout_seconds is not null
                    and coalesce(run.started_at, run.created_at)
                        + make_interval(secs => run.timeout_seconds)
                        + interval '5 minutes' < now()
                    then 'timeout_exceeded'
                when coalesce(run.started_at, run.created_at)
                        < now() - interval '10 minutes'
                    and (runner.id is null
                        or runner.status = 'revoked'
                        or runner.last_heartbeat_at is null
                        or runner.last_heartbeat_at < now() - interval '10 minutes')
                    then 'runner_unreachable'
            end as reason
        from private.devbox_runs run
        left join private.devbox_runners runner on runner.id = run.runner_id
        where run.status in ('running', 'cancel_requested')
            and (p_runner_id is null or run.runner_id = p_runner_id)
    ),
    stale as (
        select candidate.id, candidate.status, candidate.reason
        from candidates candidate
        join private.devbox_runs run on run.id = candidate.id
        where candidate.reason is not null
        order by run.updated_at
        limit v_limit
        for update of run skip locked
    ),
    reaped as (
        update private.devbox_runs run
        set status = case when stale.status = 'cancel_requested'
                then 'cancelled' else 'failed' end,
            completed_at = now(),
            updated_at = now()
        from stale
        where run.id = stale.id
            and run.status in ('running', 'cancel_requested')
        returning run.id, run.lease_id, stale.reason
    ),
    released_leases as (
        update private.devbox_leases lease
        set released_at = now(),
            status = 'released',
            updated_at = now()
        from reaped
        where lease.id = reaped.lease_id
            and lease.keep = false
            and lease.status = 'active'
        returning lease.id
    ),
    events as (
        insert into private.devbox_run_events (run_id, event_type, message, metadata)
        select reaped.id, 'reaped',
            'Devbox run stopped by the server reaper: ' || reaped.reason,
            jsonb_build_object('reason', reaped.reason)
        from reaped
        returning run_id
    )
    select count(*) into v_count from reaped;

    return v_count;
end;
$$;

revoke all on function private.reap_stale_devbox_runs(uuid, integer)
    from public, anon, authenticated;
grant execute on function private.reap_stale_devbox_runs(uuid, integer)
    to service_role;

-- Same claim as 20261004141202_playground_runner_claiming.sql, plus a bounded
-- reap of this runner's stale runs before its capacity is counted.
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
    -- Free capacity held by runs this runner can no longer finish.
    perform private.reap_stale_devbox_runs(p_runner_id, 25);
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

revoke all on function private.claim_next_devbox_run(uuid)
    from public, anon, authenticated;
grant execute on function private.claim_next_devbox_run(uuid) to service_role;
