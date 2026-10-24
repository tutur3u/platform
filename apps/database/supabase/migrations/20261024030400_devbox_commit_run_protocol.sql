-- Commit-run protocol enforcement.
--
-- A runner built without the commit-run decoder would execute the
-- __ttr_commit_run_v1__ envelope as a command, so the server, not only the
-- client's runner selection, decides who may receive one:
--   * capabilities.protocols is kept only for trusted-pool runners (reported
--     executionMode = 'trusted', no Judge or playground feature); any other
--     runner's advertisement is dropped on write;
--   * an envelope run must be pinned to a runner that supports the protocol
--     when it is inserted;
--   * a claim of an envelope by a runner that does not support it is refused
--     (the run's lease is expired so the run stops being offered), and a
--     runner that stops advertising support has its queued envelope runs
--     cancelled.
-- claim_next_devbox_run is not redefined, so concurrent changes to its body
-- (claim mode admission, stale run reaping) are unaffected.

set local lock_timeout = '5s';

create or replace function private.devbox_runner_supports_commit_run(
    p_capabilities jsonb,
    p_features jsonb
)
returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
    select coalesce(
        p_capabilities ->> 'executionMode' = 'trusted'
            and coalesce(p_features ->> 'judge', 'false') <> 'true'
            and coalesce(p_features ->> 'playground', 'false') <> 'true'
            and jsonb_typeof(p_capabilities #> '{protocols,commitRun}') = 'array'
            and (p_capabilities #> '{protocols,commitRun}') @> '1'::jsonb,
        false
    );
$$;

revoke all on function private.devbox_runner_supports_commit_run(jsonb, jsonb)
    from public, anon, authenticated;
grant execute on function private.devbox_runner_supports_commit_run(jsonb, jsonb)
    to service_role;

create or replace function private.restrict_devbox_runner_protocols()
returns trigger
language plpgsql
set search_path = private, pg_temp
as $$
begin
    if new.capabilities ? 'protocols' and not (
        coalesce(new.capabilities ->> 'executionMode', '') = 'trusted'
        and coalesce(new.enabled_features ->> 'judge', 'false') <> 'true'
        and coalesce(new.enabled_features ->> 'playground', 'false') <> 'true'
    ) then
        new.capabilities := new.capabilities - 'protocols';
    end if;
    return new;
end;
$$;

revoke all on function private.restrict_devbox_runner_protocols()
    from public, anon, authenticated;

drop trigger if exists restrict_devbox_runner_protocols on private.devbox_runners;
create trigger restrict_devbox_runner_protocols
    before insert or update of capabilities, enabled_features
    on private.devbox_runners
    for each row execute function private.restrict_devbox_runner_protocols();

create or replace function private.cancel_unsupported_devbox_commit_runs()
returns trigger
language plpgsql
security definer
set search_path = private, pg_temp
as $$
begin
    with cancelled as (
        update private.devbox_runs run
        set status = 'cancelled',
            completed_at = now(),
            updated_at = now()
        from private.devbox_leases lease
        where lease.id = run.lease_id
            and run.status = 'queued'
            and run.command[1] = '__ttr_commit_run_v1__'
            and coalesce(run.runner_id, lease.runner_id) = new.id
        returning run.id
    )
    insert into private.devbox_run_events (run_id, event_type, message)
    select cancelled.id, 'error',
        'Runner no longer supports the commit-run protocol; this queued run was cancelled. Submit it again.'
    from cancelled;
    return null;
end;
$$;

revoke all on function private.cancel_unsupported_devbox_commit_runs()
    from public, anon, authenticated;

drop trigger if exists cancel_unsupported_devbox_commit_runs on private.devbox_runners;
create trigger cancel_unsupported_devbox_commit_runs
    after update of capabilities, enabled_features on private.devbox_runners
    for each row
    when (
        private.devbox_runner_supports_commit_run(old.capabilities, old.enabled_features)
        and not private.devbox_runner_supports_commit_run(new.capabilities, new.enabled_features)
    )
    execute function private.cancel_unsupported_devbox_commit_runs();

create or replace function private.require_devbox_commit_run_runner()
returns trigger
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare
    v_lease_runner uuid;
    v_runner uuid;
    v_capabilities jsonb;
    v_features jsonb;
begin
    select lease.runner_id into v_lease_runner
    from private.devbox_leases lease
    where lease.id = new.lease_id;

    if new.runner_id is not null and v_lease_runner is not null
        and new.runner_id <> v_lease_runner then
        raise exception 'Runner does not support the commit-run protocol: the run and its lease are pinned to different runners.'
            using errcode = '55000';
    end if;
    v_runner := coalesce(new.runner_id, v_lease_runner);
    if v_runner is null then
        raise exception 'Runner does not support the commit-run protocol: commit runs must be pinned to a runner.'
            using errcode = '55000';
    end if;

    -- Lock so a concurrent heartbeat that drops support either commits first
    -- (and this insert sees it) or cancels this run after it commits.
    select runner.capabilities, runner.enabled_features
    into v_capabilities, v_features
    from private.devbox_runners runner
    where runner.id = v_runner
    for share of runner;

    if not found or not private.devbox_runner_supports_commit_run(
        v_capabilities, v_features
    ) then
        raise exception 'Runner does not support the commit-run protocol; choose a runner that advertises it.'
            using errcode = '55000';
    end if;
    return new;
end;
$$;

revoke all on function private.require_devbox_commit_run_runner()
    from public, anon, authenticated;

drop trigger if exists require_devbox_commit_run_runner on private.devbox_runs;
create trigger require_devbox_commit_run_runner
    before insert on private.devbox_runs
    for each row
    when (new.command[1] = '__ttr_commit_run_v1__')
    execute function private.require_devbox_commit_run_runner();

create or replace function private.refuse_unsupported_devbox_commit_run_claim()
returns trigger
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare
    v_capabilities jsonb;
    v_features jsonb;
begin
    select runner.capabilities, runner.enabled_features
    into v_capabilities, v_features
    from private.devbox_runners runner
    where runner.id = new.runner_id;

    if found and private.devbox_runner_supports_commit_run(
        v_capabilities, v_features
    ) then
        return new;
    end if;

    -- Skip the claim (the runner receives no job) and stop offering the run,
    -- so the refused runner is not handed the same run on every poll.
    update private.devbox_leases
    set expires_at = now(), updated_at = now()
    where id = new.lease_id;
    insert into private.devbox_run_events (run_id, event_type, message)
    values (new.id, 'error',
        'Claim refused: the runner does not support the commit-run protocol. Stop this run and submit it again.');
    return null;
end;
$$;

revoke all on function private.refuse_unsupported_devbox_commit_run_claim()
    from public, anon, authenticated;

drop trigger if exists refuse_unsupported_devbox_commit_run_claim on private.devbox_runs;
create trigger refuse_unsupported_devbox_commit_run_claim
    before update of status on private.devbox_runs
    for each row
    when (
        old.status = 'queued'
        and new.status = 'running'
        and new.command[1] = '__ttr_commit_run_v1__'
    )
    execute function private.refuse_unsupported_devbox_commit_run_claim();

-- Drop advertisements already stored for runners outside the trusted pool.
update private.devbox_runners
set capabilities = capabilities - 'protocols'
where capabilities ? 'protocols'
    and not (
        coalesce(capabilities ->> 'executionMode', '') = 'trusted'
        and coalesce(enabled_features ->> 'judge', 'false') <> 'true'
        and coalesce(enabled_features ->> 'playground', 'false') <> 'true'
    );
