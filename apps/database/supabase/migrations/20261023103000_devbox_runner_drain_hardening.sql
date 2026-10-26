-- Devbox drain hardening (follow-up to 20261023100000_devbox_runner_trust_pools).
--
-- * New Judge/playground work never selects a draining runner, and no queued
--   non-maintenance run may be inserted against a draining runner (a draining
--   runner only claims maintenance, so such a run would strand).
-- * Feature toggles lock the runner row first so concurrent toggles or a
--   concurrent heartbeat cannot produce a runner with both trust tiers.
-- * Requeued Judge work only moves to a runner that enqueue would have chosen:
--   it supports the submission's language and is not a trusted runner.
-- * Activity counts only unexpired leases and reports kept (persistent) leases
--   separately; a drain never releases kept leases, so they do not block
--   "drained".

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

    -- Serialize with other toggles and heartbeats before reading the row, so
    -- the trust-tier checks below see the state this update applies to.
    perform 1 from private.devbox_runners where id = p_runner_id for update;

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

-- Backstop for every insert path (web store, enqueue RPCs, direct writes): a
-- queued non-maintenance run pinned to a draining runner would never be
-- claimed. FOR SHARE serializes with set_devbox_runner_drain: either the
-- drain commits first and this insert is rejected, or the insert commits
-- first and the drain's cancellation sweep sees it.
create or replace function private.reject_devbox_run_on_draining_runner()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
    v_lease_runner uuid;
begin
    if new.workload = 'maintenance' then
        return new;
    end if;

    select lease.runner_id into v_lease_runner
    from private.devbox_leases lease
    where lease.id = new.lease_id;

    -- Lock unconditionally: a predicate on drain_requested_at would skip the
    -- lock while a concurrent drain is still uncommitted.
    perform 1
    from private.devbox_runners runner
    where runner.id in (new.runner_id, v_lease_runner)
    for share of runner;

    if exists (
        select 1 from private.devbox_runners runner
        where runner.id in (new.runner_id, v_lease_runner)
            and runner.drain_requested_at is not null
    ) then
        raise exception 'Runner is draining; it accepts only maintenance runs. Choose another runner.'
            using errcode = '55000';
    end if;

    return new;
end;
$$;

drop trigger if exists reject_devbox_run_on_draining_runner on private.devbox_runs;
create trigger reject_devbox_run_on_draining_runner
    before insert on private.devbox_runs
    for each row execute function private.reject_devbox_run_on_draining_runner();

revoke all on function private.reject_devbox_run_on_draining_runner() from public, anon, authenticated;

create or replace function private.enqueue_learn_coding_execution(
    p_ws_id uuid,
    p_user_id uuid,
    p_challenge_slug text,
    p_source text,
    p_command text[],
    p_language text,
    p_kind text
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
        or length(p_source) < 1
        or length(p_source) > 16000
        or array_length(p_command, 1) <> 2
        or p_command[1] <> '__ttr_judge_v1__'
        or length(p_command[2]) > 48000
        or p_language is null
        or p_language not in ('python', 'javascript', 'typescript', 'c',
            'cpp', 'java', 'rust', 'go', 'ruby', 'php')
        or p_kind is null
        or p_kind not in ('test', 'submit')
    then
        raise exception 'Invalid coding execution';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

    if (select count(*) from private.learn_coding_submissions
        where user_id = p_user_id and created_at > now() - interval '1 hour') >= 60
        or (p_kind = 'submit' and (
            select count(*) from private.learn_coding_submissions
            where user_id = p_user_id and kind = 'submit'
                and created_at > now() - interval '1 hour') >= 20)
    then
        raise exception 'Coding execution rate limit exceeded';
    end if;

    select runner.id into v_runner_id
    from private.devbox_runners runner
    where runner.status = 'online'
        and runner.drain_requested_at is null
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
        id, ws_id, user_id, challenge_slug, source, run_id, kind, language
    ) values (
        v_submission_id, p_ws_id, p_user_id, p_challenge_slug, p_source,
        v_run_id, p_kind, p_language
    );

    return v_submission_id;
end;
$$;

-- Playground selection: unchanged except that a draining runner is skipped
-- (a draining runner claims only maintenance, so the job would strand).
create or replace function private.enqueue_learn_playground(p_actor_id uuid,p_id uuid,p_revision integer,p_operation text,p_command text[],p_request_id uuid,p_meeting_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_project private.learn_playgrounds; v_runner uuid; v_lease uuid; v_run uuid; v_language text;
begin
  if not private.account_playgrounds_allowed(p_actor_id) and not private.meeting_programming_elevated(p_meeting_id,p_actor_id) then raise insufficient_privilege; end if;
  select * into v_project from private.learn_playgrounds where id=p_id and actor_id=p_actor_id for update;
  if not found then raise exception 'Project missing' using errcode='P0002'; end if;
  if v_project.personal_ws_id is distinct from private.account_personal_workspace(p_actor_id) then raise insufficient_privilege; end if;
  select j.run_id into v_run from private.learn_playground_runs j join private.devbox_runs r on r.id=j.run_id
    where j.request_id=p_request_id and j.project_id=p_id and r.actor_id=p_actor_id;
  if v_run is not null then return v_run; end if;
  if v_project.revision<>p_revision or v_project.drive_path is null then raise exception 'Save first' using errcode='40001'; end if;
  if p_operation not in ('run','stop','preview') or p_command[1]<>'__ttr_playground_v1__'
    or cardinality(p_command)<>2 or length(p_command[2])>4000000 then raise exception 'Invalid job' using errcode='22023'; end if;
  if p_operation='run' and exists(select 1 from private.learn_playground_runs j join private.devbox_runs r on r.id=j.run_id
    where j.project_id=p_id and r.status in ('queued','running','cancel_requested')) then raise exception 'Project busy' using errcode='40001'; end if;
  if (select count(*) from private.learn_playground_runs j join private.devbox_runs r on r.id=j.run_id
    where r.actor_id=p_actor_id and r.status in ('queued','running','cancel_requested')) >= 4 then
    raise exception 'Too many pending jobs' using errcode='53300'; end if;
  -- Platform operators explicitly opt in. Customer runner registration never supplies this pool.
  select runner.id into v_runner from private.devbox_runners runner
    where runner.status='online' and runner.heartbeat_enabled and runner.last_heartbeat_at>now()-interval '90 seconds'
      and runner.drain_requested_at is null
      and runner.enabled_features->>'playground'='true' and runner.capabilities#>>'{playground,ready}'='true'
      and (runner.capabilities#>'{playground,languages}') ? v_project.language
      and (p_operation='run' or runner.id=v_project.runner_id)
    order by (runner.id=v_project.runner_id) desc nulls last,
      (select count(*) from private.devbox_runs r where r.runner_id=runner.id and r.status='running'), runner.id limit 1;
  if v_runner is null then raise exception 'No ready playground runner' using errcode='53300'; end if;
  insert into private.devbox_leases(actor_id,runner_id,status,expires_at,keep)
    values(p_actor_id,v_runner,'active',now()+interval '5 minutes',false) returning id into v_lease;
  insert into private.devbox_runs(actor_id,lease_id,command,workload,timeout_seconds)
    values(p_actor_id,v_lease,p_command,'playground',120) returning id into v_run;
  insert into private.learn_playground_runs(run_id,project_id,revision,operation,request_id,meeting_id) values(v_run,p_id,p_revision,p_operation,p_request_id,p_meeting_id);
  update private.learn_playgrounds set runner_id=v_runner where id=p_id;
  return v_run;
end $$;

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

-- Return columns change, so the function is recreated. Expired leases no
-- longer count, and kept leases (which a drain intentionally leaves alone)
-- are reported separately instead of blocking "drained".
drop function if exists private.devbox_runner_activity();
create function private.devbox_runner_activity()
returns table (
    runner_id uuid,
    queued_runs bigint,
    running_runs bigint,
    active_leases bigint,
    kept_leases bigint
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
            where lease.runner_id = runner.id and lease.status = 'active'
                and not lease.keep and lease.expires_at > now()),
        (select count(*) from private.devbox_leases lease
            where lease.runner_id = runner.id and lease.status = 'active'
                and lease.keep and lease.expires_at > now())
    from private.devbox_runners runner
    where runner.status <> 'revoked';
$$;

revoke all on function private.devbox_runner_activity() from public, anon, authenticated;
grant execute on function private.devbox_runner_activity() to service_role;

-- Unchanged except that queued Judge work whose lease is no longer claimable
-- (expired or not active) is cancelled too: claims require a live lease, so
-- it could never be requeued and would keep the runner from draining.
-- Requesting a drain again re-runs these sweeps.
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
                and run.workload <> 'maintenance'
                and (
                    run.workload <> 'judge'
                    or not exists (
                        select 1 from private.devbox_leases live
                        where live.id = run.lease_id
                            and live.status = 'active'
                            and live.expires_at > now()
                    )
                )
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
