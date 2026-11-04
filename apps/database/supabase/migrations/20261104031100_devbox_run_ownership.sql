-- SR-332/333/334. Applies after 20261104031050 (#7142, shared grant predicate).
-- Composes 20261023103000 drain/feature hardening, 20261026145000 mode
-- admission, and the LIVE 20261026145300 bounded reaper/claim definition.
-- Existing fleet designation is retained; personal runners are owner-only.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
-- 20261104031050 is a hard prerequisite: refuse to apply without it rather
-- than treating every personal grant as inactive.
do $$ begin
    if to_regclass('private.devbox_personal_pool_grants') is null
        or to_regprocedure('private.devbox_identity_grant_active(uuid)') is null then
        raise exception 'Apply 20261104031050_devbox_identity_grant_predicate before 20261104031100.';
    end if;
end $$;
alter table private.devbox_runners
    add column if not exists pool text not null default 'fleet'
    check (pool in ('fleet', 'personal'));

create or replace function private.devbox_actor_is_root_member(p_actor_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, pg_temp as $$
    select exists (select 1 from public.workspace_members m
        where m.ws_id = '00000000-0000-0000-0000-000000000000'::uuid
            and m.user_id = p_actor_id and m.type = 'MEMBER');
$$;
revoke all on function private.devbox_actor_is_root_member(uuid) from public, anon, authenticated;
grant execute on function private.devbox_actor_is_root_member(uuid) to service_role;

-- Delegates to the shared user_id grant contract. A missing or broken
-- predicate raises; it is never read as "no grant".
create or replace function private.devbox_actor_has_active_personal_grant(p_actor_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, pg_temp as $$
    select coalesce(private.devbox_identity_grant_active(p_actor_id), false);
$$;
revoke all on function private.devbox_actor_has_active_personal_grant(uuid) from public, anon, authenticated;
grant execute on function private.devbox_actor_has_active_personal_grant(uuid) to service_role;

create or replace function private.check_devbox_write_ownership(
    p_actor_id uuid, p_lease_id uuid default null,
    p_runner_id uuid default null, p_workload text default 'run'
) returns void language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare
    v_lease private.devbox_leases%rowtype;
    v_runner private.devbox_runners%rowtype;
    v_runner_id uuid;
begin
    if p_actor_id is null then
        raise exception 'Devbox actor is required.' using errcode = '42501';
    end if;
    if p_lease_id is not null then
        select * into v_lease from private.devbox_leases l
            where l.id = p_lease_id for share;
        if not found or v_lease.actor_id is distinct from p_actor_id then
            raise exception 'Devbox lease not found.' using errcode = '42501';
        end if;
        if v_lease.status <> 'active' or v_lease.expires_at <= now() then
            raise exception 'Devbox lease is not active.' using errcode = '42501';
        end if;
    end if;
    for v_runner_id in select distinct r from unnest(array[p_runner_id, v_lease.runner_id]) r where r is not null loop
        -- Owner and pool are immutable (preserve_devbox_runner_owner), so a
        -- key-share lock that only blocks deletion does not race heartbeats.
        select * into v_runner from private.devbox_runners r
            where r.id = v_runner_id for key share;
        if not found then
            raise exception 'Devbox runner is not available to this actor.' using errcode = '42501';
        end if;
        if v_runner.actor_id = p_actor_id and (private.devbox_actor_is_root_member(p_actor_id)
            or (v_runner.pool = 'personal' and private.devbox_actor_has_active_personal_grant(p_actor_id))) then continue; end if;
        if v_runner.pool = 'fleet' and private.devbox_actor_is_root_member(p_actor_id) then continue; end if;
        -- The service-only enqueue RPCs create learner leases on dedicated pools.
        -- A later run must still pass its workload envelope and claim gates.
        if v_runner.pool = 'fleet' and p_workload in ('judge', 'playground', 'pool')
            and coalesce(v_runner.enabled_features ->> 'run', 'false') <> 'true'
            and coalesce(v_runner.enabled_features ->> 'build', 'false') <> 'true'
            and coalesce(v_runner.enabled_features ->> 'serve', 'false') <> 'true'
            and coalesce(v_runner.enabled_features ->> 'tunnel', 'false') <> 'true'
            and (v_runner.enabled_features ->> 'judge' = 'true'
                or v_runner.enabled_features ->> 'playground' = 'true') then continue; end if;
        raise exception 'Devbox runner is not available to this actor.' using errcode = '42501';
    end loop;
end;
$$;
revoke all on function private.check_devbox_write_ownership(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function private.check_devbox_write_ownership(uuid,uuid,uuid,text) to service_role;

create or replace function private.enforce_devbox_lease_actor()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
begin
    perform 1 from private.devbox_leases l
        where l.id = new.lease_id and l.actor_id = new.actor_id for share;
    if not found then
        raise exception 'Devbox lease not found.' using errcode = '42501';
    end if;
    return new;
end;
$$;
revoke all on function private.enforce_devbox_lease_actor() from public, anon, authenticated;
grant execute on function private.enforce_devbox_lease_actor() to service_role;
create trigger enforce_devbox_lease_actor before insert or update of lease_id, actor_id
    on private.devbox_runs for each row execute function private.enforce_devbox_lease_actor();
create trigger enforce_devbox_lease_actor before insert or update of lease_id, actor_id
    on private.devbox_env_revisions for each row execute function private.enforce_devbox_lease_actor();

create or replace function private.enforce_devbox_runner_actor()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
begin
    if tg_table_name = 'devbox_leases' then
        perform private.check_devbox_write_ownership(new.actor_id, null, new.runner_id, 'pool');
    else
        perform private.check_devbox_write_ownership(new.actor_id, null, new.runner_id, new.workload);
        perform private.check_devbox_write_ownership(new.actor_id, null,
            (select l.runner_id from private.devbox_leases l where l.id = new.lease_id), new.workload);
    end if;
    return new;
end;
$$;
revoke all on function private.enforce_devbox_runner_actor() from public, anon, authenticated;
grant execute on function private.enforce_devbox_runner_actor() to service_role;
create trigger enforce_devbox_runner_actor before insert or update of runner_id, actor_id
    on private.devbox_leases for each row execute function private.enforce_devbox_runner_actor();
create trigger enforce_devbox_runner_actor before insert or update of runner_id, actor_id, lease_id, workload
    on private.devbox_runs for each row execute function private.enforce_devbox_runner_actor();

-- Lease owners cannot be transferred underneath existing runs or env revisions.
create or replace function private.preserve_devbox_lease_actor()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
begin
    if new.actor_id is distinct from old.actor_id then
        raise exception 'Devbox lease ownership is immutable.' using errcode = '42501';
    end if;
    return new;
end;
$$;
revoke all on function private.preserve_devbox_lease_actor() from public, anon, authenticated;
grant execute on function private.preserve_devbox_lease_actor() to service_role;
create trigger preserve_devbox_lease_actor before update of actor_id on private.devbox_leases
    for each row execute function private.preserve_devbox_lease_actor();

-- A runner's owner and pool decide every claim and pin. Neither moves under
-- existing leases and runs: re-own a runner by registering a new one.
create or replace function private.preserve_devbox_runner_owner()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
begin
    if new.actor_id is distinct from old.actor_id or new.pool is distinct from old.pool then
        raise exception 'Devbox runner owner and pool are immutable.' using errcode = '42501';
    end if;
    return new;
end;
$$;
revoke all on function private.preserve_devbox_runner_owner() from public, anon, authenticated;
grant execute on function private.preserve_devbox_runner_owner() to service_role;
create trigger preserve_devbox_runner_owner before update of actor_id, pool on private.devbox_runners
    for each row execute function private.preserve_devbox_runner_owner();

-- Cancels the work a revoked authorization covered. Judge and playground
-- learner work and keep leases never depend on either authorization, so
-- they are left alone (decision 4).
--   personal: run/build pinned (by the run or its lease) to a personal
--             runner, and non-keep leases pinned to a personal runner. Root
--             members keep their own personal runners without a grant.
--   root:     every other workload, except run/build off the fleet that an
--             active personal grant still covers, and non-keep leases that
--             carry no Judge or playground run.
create or replace function private.cancel_devbox_revoked_work(p_actor_id uuid, p_scope text)
returns void language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare
    v_grant_active boolean;
begin
    if p_scope is null or p_scope not in ('personal', 'root') then
        raise exception 'Unsupported devbox revocation scope: %', p_scope using errcode = '22023';
    end if;
    if p_scope = 'personal' and private.devbox_actor_is_root_member(p_actor_id) then
        return;
    end if;
    v_grant_active := p_scope = 'root' and private.devbox_actor_has_active_personal_grant(p_actor_id);
    with targets as (
        select run.id from private.devbox_runs run
        join private.devbox_leases lease on lease.id = run.lease_id
        where run.actor_id = p_actor_id and run.status in ('queued', 'running')
            and run.workload not in ('judge', 'playground')
            and case p_scope
                when 'personal' then run.workload in ('run', 'build')
                    and exists (select 1 from private.devbox_runners runner
                        where runner.id in (run.runner_id, lease.runner_id) and runner.pool = 'personal')
                else not (v_grant_active and run.workload in ('run', 'build')
                    and not exists (select 1 from private.devbox_runners runner
                        where runner.id in (run.runner_id, lease.runner_id) and runner.pool = 'fleet'))
            end
        for update of run
    ), stopped as (
        update private.devbox_runs run
        set status = case when run.status = 'queued' then 'cancelled' else 'cancel_requested' end,
            completed_at = case when run.status = 'queued' then now() else run.completed_at end,
            updated_at = now()
        from targets where run.id = targets.id
        returning run.id, run.status
    )
    insert into private.devbox_run_events(run_id,event_type,message,metadata)
    select id, 'access_revoked', 'Devbox access revoked; cancellation requested.',
        jsonb_build_object('reason','actor_access_revoked','scope',p_scope,'status',status) from stopped;
    update private.devbox_leases lease
    set status = 'released', released_at = now(), updated_at = now()
    where lease.actor_id = p_actor_id and lease.status = 'active' and not lease.keep
        and not exists (select 1 from private.devbox_runs learner
            where learner.lease_id = lease.id and learner.workload in ('judge', 'playground'))
        and case p_scope
            when 'personal' then exists (select 1 from private.devbox_runners runner
                where runner.id = lease.runner_id and runner.pool = 'personal')
            else not (v_grant_active and not exists (select 1 from private.devbox_runners runner
                where runner.id = lease.runner_id and runner.pool = 'fleet'))
        end;
end;
$$;
revoke all on function private.cancel_devbox_revoked_work(uuid,text) from public, anon, authenticated;
grant execute on function private.cancel_devbox_revoked_work(uuid,text) to service_role;

-- Root membership: fires only when a root MEMBER row stops being one.
create or replace function private.cancel_devbox_runs_on_access_revocation()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
begin
    if old.ws_id is distinct from '00000000-0000-0000-0000-000000000000'::uuid
        or old.type is distinct from 'MEMBER' then return null; end if;
    if tg_op = 'UPDATE' then
        if new.ws_id = old.ws_id and new.user_id = old.user_id and new.type = 'MEMBER' then return null; end if;
    end if;
    perform private.cancel_devbox_revoked_work(old.user_id, 'root');
    return null;
end;
$$;
revoke all on function private.cancel_devbox_runs_on_access_revocation() from public, anon, authenticated;
grant execute on function private.cancel_devbox_runs_on_access_revocation() to service_role;
create trigger cancel_devbox_runs_on_access_revocation after delete or update
    on public.workspace_members for each row execute function private.cancel_devbox_runs_on_access_revocation();

-- Personal grants: fires only on an active -> inactive transition of the row
-- (UPDATE) or the DELETE of an active row. Editing or deleting a pending,
-- suspended, revoked or already-expired grant cancels nothing; natural expiry
-- and the personal_pools_enabled switch are left to the claim gate and sweep.
create or replace function private.cancel_devbox_runs_on_grant_revocation()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
begin
    if not coalesce(old.status = 'active' and old.suspended = false
        and old.accepted_at <= now() and old.expires_at > now(), false) then
        return null;
    end if;
    if tg_op = 'UPDATE' and coalesce(new.user_id = old.user_id
        and new.status = 'active' and new.suspended = false
        and new.accepted_at <= now() and new.expires_at > now(), false) then
        return null;
    end if;
    perform private.cancel_devbox_revoked_work(old.user_id, 'personal');
    return null;
end;
$$;
revoke all on function private.cancel_devbox_runs_on_grant_revocation() from public, anon, authenticated;
grant execute on function private.cancel_devbox_runs_on_grant_revocation() to service_role;
create trigger cancel_devbox_runs_on_grant_revocation after delete or update
    on private.devbox_personal_pool_grants for each row execute function private.cancel_devbox_runs_on_grant_revocation();

-- Backstop for natural expiry, the personal_pools_enabled switch and rows
-- queued after a removal. It is not on the claim path: Cron Control calls it
-- (job database-devbox-unauthorized-run-sweep). Each call reads at most
-- p_limit of the oldest queued non-learner rows through the partial
-- claim-queue index, checks each distinct owner once, and cancels only that
-- window. Unauthorized rows behind a full window wait for a later call; the
-- claim gate still refuses them meanwhile.
create or replace function private.cancel_unauthorized_devbox_runs(p_limit integer default 1000)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp
set statement_timeout = '10s'
set lock_timeout = '1s'
as $$
declare
    v_scanned integer;
    v_cancelled integer;
begin
    if p_limit is null or p_limit < 1 or p_limit > 1000 then
        raise exception 'p_limit must be between 1 and 1000' using errcode = '22023';
    end if;
    with scan as materialized (
        select run.id, run.actor_id from private.devbox_runs run
        where run.status = 'queued'
            and run.workload in ('run', 'build', 'serve', 'tunnel', 'maintenance')
        order by run.created_at
        limit p_limit
    ), denied as materialized (
        select owner.actor_id from (select distinct scan.actor_id from scan) owner
        where not private.devbox_actor_is_root_member(owner.actor_id)
            and not private.devbox_actor_has_active_personal_grant(owner.actor_id)
    ), candidates as (
        select run.id from private.devbox_runs run
        join scan on scan.id = run.id
        join denied on denied.actor_id = scan.actor_id
        where run.status = 'queued'
        for update of run skip locked
    ), stopped as (
        update private.devbox_runs run set status='cancelled',completed_at=now(),updated_at=now()
        from candidates where run.id=candidates.id returning run.id
    ), audited as (
        insert into private.devbox_run_events(run_id,event_type,message,metadata)
        select id,'access_revoked','Devbox run cancelled: owner is no longer authorized.',
            jsonb_build_object('reason','actor_access_revoked') from stopped
        returning 1
    )
    select (select count(*) from scan), (select count(*) from audited)
        into v_scanned, v_cancelled;
    return jsonb_build_object('scanned', v_scanned, 'cancelled', v_cancelled);
end;
$$;
revoke all on function private.cancel_unauthorized_devbox_runs(integer) from public, anon, authenticated;
grant execute on function private.cancel_unauthorized_devbox_runs(integer) to service_role;

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
set search_path = pg_catalog, pg_temp
as $$
declare
    v_owner_id uuid;
    v_pool text;
begin
    -- Serialize claims sharing one runner token before checking its capacity.
    perform pg_advisory_xact_lock(hashtextextended(p_runner_id::text, 1));
    perform private.reap_stale_devbox_runs(p_runner_id, 25);
    -- Fail closed for every workload when the runner owner is no longer
    -- authorized, and say why in the database log. Re-own by registering a
    -- new runner (devbox runbook); owner and pool are immutable.
    select owner.actor_id, owner.pool into v_owner_id, v_pool
        from private.devbox_runners owner where owner.id = p_runner_id;
    if found and not (private.devbox_actor_is_root_member(v_owner_id)
        or (v_pool = 'personal' and private.devbox_actor_has_active_personal_grant(v_owner_id))) then
        raise log 'devbox claim denied: reason=runner_owner_not_authorized runner_id=% pool=% owner_id=%',
            p_runner_id, v_pool, v_owner_id;
        return;
    end if;
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
            and run.actor_id = lease.actor_id
            and (private.devbox_actor_is_root_member(runner.actor_id)
                or (runner.pool = 'personal'
                    and private.devbox_actor_has_active_personal_grant(runner.actor_id)))
            and (
                (run.actor_id = runner.actor_id
                    and (run.workload in ('run', 'build')
                        or runner.pool = 'fleet'
                        or (run.workload = 'maintenance'
                            and private.devbox_actor_is_root_member(run.actor_id)
                            and (run.runner_id = p_runner_id or lease.runner_id = p_runner_id))))
                or (runner.pool = 'fleet' and (
                    run.workload in ('judge', 'playground')
                    or private.devbox_actor_is_root_member(run.actor_id)
                ))
            )
            and (run.workload in ('judge', 'playground')
                or private.devbox_actor_is_root_member(run.actor_id)
                or (runner.pool = 'personal' and run.actor_id = runner.actor_id
                    and private.devbox_actor_has_active_personal_grant(run.actor_id)))
            and (run.workload <> 'maintenance' or runner.pool = 'fleet'
                or run.runner_id = p_runner_id or lease.runner_id = p_runner_id)
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
                and exists (select 1 from private.learn_coding_submissions submission where submission.run_id = run.id)
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

revoke all on function private.claim_next_devbox_run(uuid) from public, anon, authenticated;
grant execute on function private.claim_next_devbox_run(uuid) to service_role;
create or replace function private.set_devbox_runner_feature(
    p_runner_id uuid,
    p_feature text,
    p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
    v_features jsonb;
begin
    if p_feature not in ('run', 'build', 'serve', 'tunnel', 'judge', 'playground') then
        raise exception 'Unsupported devbox feature: %', p_feature;
    end if;

    -- Serialize with other toggles and heartbeats before reading the row, so
    -- the trust-tier checks below see the state this update applies to.
    perform 1 from private.devbox_runners where id = p_runner_id for update;

    if p_enabled and p_feature in ('judge', 'playground', 'serve', 'tunnel') and exists (
        select 1 from private.devbox_runners where id = p_runner_id and pool = 'personal'
    ) then
        raise exception 'Personal runners support only run and build' using errcode = '42501';
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


revoke all on function private.set_devbox_runner_feature(uuid,text,boolean) from public, anon, authenticated;
grant execute on function private.set_devbox_runner_feature(uuid,text,boolean) to service_role;
commit;
