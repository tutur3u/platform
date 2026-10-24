-- Devbox claim mode admission (S4), behind a database flag that defaults OFF.
--
-- When private.devbox_control_settings.require_reported_execution_mode is on:
--   * run/build/serve/tunnel claims require the runner's capabilities to report
--     executionMode = 'trusted' within the freshness window;
--   * Judge claims refuse any runner reporting 'trusted', even when the
--     timestamp is stale or missing; legacy agents without a mode may claim;
--   * playground and maintenance claims are unchanged (playground pools run in
--     trusted mode behind the agent's pool fence and the S2 feature exclusion).
-- Trusted-work freshness is stamped by
-- the database (capabilities_updated_at), never taken from the agent's clock.
-- Judge always refuses trusted reports; the flag gates trusted-work freshness.
--
-- This redefines claim_next_devbox_run on top of the S2/S3 drain-aware body
-- (20261023100000_devbox_runner_trust_pools.sql) and its hardened requeue
-- (20261023103000_devbox_runner_drain_hardening.sql); it must apply after both.
-- drain_requested_at is added here too so this migration also applies alone.

alter table private.devbox_runners
    add column if not exists drain_requested_at timestamptz;

alter table private.devbox_runners
    add column if not exists capabilities_updated_at timestamptz;

-- Every report write is server-stamped, including identical capabilities.
-- Timestamp-only writes cannot forge freshness or erase the report timestamp.
create or replace function private.stamp_devbox_runner_capabilities()
returns trigger
language plpgsql
set search_path = private, public, pg_temp
as $$
begin
    new.capabilities_updated_at := case
        when new.capabilities is not null then now()
        else null
    end;
    return new;
end;
$$;

drop trigger if exists stamp_devbox_runner_capabilities on private.devbox_runners;
create trigger stamp_devbox_runner_capabilities
    before insert or update of capabilities, capabilities_updated_at on private.devbox_runners
    for each row execute function private.stamp_devbox_runner_capabilities();

create table if not exists private.devbox_control_settings (
    id boolean primary key default true check (id),
    require_reported_execution_mode boolean not null default false,
    updated_at timestamptz not null default now()
);
insert into private.devbox_control_settings (id) values (true)
    on conflict (id) do nothing;
alter table private.devbox_control_settings enable row level security;
revoke all on private.devbox_control_settings from public, anon, authenticated;
grant select on private.devbox_control_settings to service_role;

create or replace function private.devbox_require_reported_execution_mode()
returns boolean
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
    select coalesce(
        (select require_reported_execution_mode
            from private.devbox_control_settings where id),
        false
    );
$$;

create or replace function private.devbox_reports_fresh_trusted(
    p_capabilities jsonb,
    p_capabilities_updated_at timestamptz
)
returns boolean
language sql
stable
set search_path = private, public, pg_temp
as $$
    select coalesce(p_capabilities ->> 'executionMode' = 'trusted', false)
        and coalesce(p_capabilities_updated_at > now() - interval '90 seconds'
            and p_capabilities_updated_at <= now(), false);
$$;

create or replace function private.devbox_runner_mode_admits(
    p_capabilities jsonb,
    p_capabilities_updated_at timestamptz,
    p_workload text
)
returns boolean
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
    -- A trusted report permanently narrows Judge admission regardless of age.
    select case
        when p_workload = 'judge' then
            p_capabilities ->> 'executionMode' is distinct from 'trusted'
        when not private.devbox_require_reported_execution_mode() then true
        when p_workload in ('run', 'build', 'serve', 'tunnel') then
            private.devbox_reports_fresh_trusted(p_capabilities, p_capabilities_updated_at)
        else true
    end;
$$;

-- Enabling refuses while any trusted-feature runner lacks a fresh trusted
-- report (it would silently stop receiving work) unless p_force is set.
create or replace function private.set_devbox_require_reported_execution_mode(
    p_enabled boolean,
    p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
    v_unready jsonb;
begin
    if p_enabled is null then
        raise exception 'p_enabled must not be NULL';
    end if;

    select coalesce(jsonb_agg(runner.id order by runner.id), '[]'::jsonb)
    into v_unready
    from private.devbox_runners runner
    where runner.status <> 'revoked'
        and (
            runner.enabled_features ->> 'run' = 'true'
            or runner.enabled_features ->> 'build' = 'true'
            or runner.enabled_features ->> 'serve' = 'true'
            or runner.enabled_features ->> 'tunnel' = 'true'
        )
        and not private.devbox_reports_fresh_trusted(
            runner.capabilities,
            runner.capabilities_updated_at
        );

    if p_enabled and jsonb_array_length(v_unready) > 0 and p_force is not true then
        raise exception 'Run-enabled runners have not reported executionMode=trusted: %', v_unready;
    end if;

    update private.devbox_control_settings
    set require_reported_execution_mode = p_enabled,
        updated_at = now()
    where id;

    return jsonb_build_object(
        'require_reported_execution_mode', p_enabled,
        'unready_runners', v_unready
    );
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
                -- another Judge runner that enqueue would also have chosen:
                -- it supports the submission's language and is not trusted.
                or (
                    run.workload = 'judge'
                    and (run.runner_id is null or run.runner_id in (
                        select draining.id from private.devbox_runners draining
                        where draining.drain_requested_at is not null))
                    and (lease.runner_id is null or lease.runner_id in (
                        select draining.id from private.devbox_runners draining
                        where draining.drain_requested_at is not null))
                    and runner.capabilities ->> 'executionMode' is distinct from 'trusted'
                    and coalesce(runner.enabled_features ->> 'run', 'false') <> 'true'
                    and coalesce(runner.enabled_features ->> 'build', 'false') <> 'true'
                    and coalesce(runner.enabled_features ->> 'serve', 'false') <> 'true'
                    and coalesce(runner.enabled_features ->> 'tunnel', 'false') <> 'true'
                    and exists (
                        select 1 from private.learn_coding_submissions submission
                        where submission.run_id = run.id
                            and runner.capabilities #> '{judge,languages}' ? submission.language
                    )
                )
            )
            -- A draining runner finishes in-flight work and accepts only
            -- maintenance (restart/upgrade); it claims nothing else.
            and (runner.drain_requested_at is null or run.workload = 'maintenance')
            -- S4 (flagged): trusted workloads need a fresh, server-stamped
            -- `trusted` report; Judge refuses any `trusted` report.
            -- Judge denial also applies while freshness admission is off.
            and private.devbox_runner_mode_admits(
                runner.capabilities,
                runner.capabilities_updated_at,
                run.workload
            )
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

revoke all on function private.devbox_require_reported_execution_mode() from public, anon, authenticated;
grant execute on function private.devbox_require_reported_execution_mode() to service_role;
revoke all on function private.devbox_reports_fresh_trusted(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function private.devbox_reports_fresh_trusted(jsonb, timestamptz) to service_role;
revoke all on function private.devbox_runner_mode_admits(jsonb, timestamptz, text) from public, anon, authenticated;
grant execute on function private.devbox_runner_mode_admits(jsonb, timestamptz, text) to service_role;
revoke all on function private.set_devbox_require_reported_execution_mode(boolean, boolean) from public, anon, authenticated;
grant execute on function private.set_devbox_require_reported_execution_mode(boolean, boolean) to service_role;
revoke all on function private.stamp_devbox_runner_capabilities() from public, anon, authenticated;
