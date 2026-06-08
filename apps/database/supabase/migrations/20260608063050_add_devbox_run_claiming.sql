alter table private.devbox_runs
    add column if not exists runner_id uuid references private.devbox_runners(id) on delete set null;

create index if not exists idx_devbox_runs_claim_queue
    on private.devbox_runs(status, created_at)
    where status = 'queued';

create index if not exists idx_devbox_runs_runner_status
    on private.devbox_runs(runner_id, status, updated_at desc);

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
        where run.status = 'queued'
            and (run.runner_id is null or run.runner_id = p_runner_id)
            and (lease.runner_id is null or lease.runner_id = p_runner_id)
            and lease.status = 'active'
            and lease.expires_at > now()
        order by run.created_at
        for update of run skip locked
        limit 1
    ),
    claimed as (
        update private.devbox_runs run
        set
            runner_id = p_runner_id,
            status = 'running',
            started_at = coalesce(run.started_at, now()),
            updated_at = now()
        from next_run
        where run.id = next_run.id
        returning
            run.id,
            run.actor_id,
            run.lease_id,
            run.command,
            run.env,
            run.env_files,
            run.preview_ports,
            run.timeout_seconds,
            run.created_at,
            run.updated_at
    )
    select
        claimed.id,
        claimed.actor_id,
        claimed.lease_id,
        claimed.command,
        claimed.env,
        claimed.env_files,
        claimed.preview_ports,
        claimed.timeout_seconds,
        claimed.created_at,
        claimed.updated_at
    from claimed;
end;
$$;

revoke all on function private.claim_next_devbox_run(uuid) from public, anon, authenticated;
grant execute on function private.claim_next_devbox_run(uuid) to service_role;

create or replace function private.complete_devbox_run(
    p_runner_id uuid,
    p_run_id uuid,
    p_status text,
    p_exit_code integer
)
returns table (
    id uuid,
    lease_id uuid,
    status text,
    exit_code integer
)
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
    if p_status not in ('succeeded', 'failed', 'cancelled') then
        raise exception 'Invalid devbox run completion status: %', p_status;
    end if;

    return query
    with completed as (
        update private.devbox_runs run
        set
            status = p_status,
            exit_code = p_exit_code,
            completed_at = now(),
            updated_at = now()
        where run.id = p_run_id
            and run.runner_id = p_runner_id
            and run.status in ('running', 'cancel_requested')
        returning run.id, run.lease_id, run.status, run.exit_code
    ),
    released_leases as (
        update private.devbox_leases lease
        set
            released_at = now(),
            status = 'released',
            updated_at = now()
        from completed
        where lease.id = completed.lease_id
            and lease.keep = false
            and lease.status = 'active'
        returning lease.id
    )
    select
        completed.id,
        completed.lease_id,
        completed.status,
        completed.exit_code
    from completed;
end;
$$;

revoke all on function private.complete_devbox_run(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function private.complete_devbox_run(uuid, uuid, text, integer) to service_role;
