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

create function private.available_playground_languages() returns jsonb
language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(distinct language),'[]'::jsonb) from private.devbox_runners r,
  lateral jsonb_array_elements_text(coalesce(r.capabilities#>'{playground,languages}','[]'::jsonb)) language
where r.status='online' and r.heartbeat_enabled and r.last_heartbeat_at>now()-interval '90 seconds'
  and r.enabled_features->>'playground'='true' and r.capabilities#>>'{playground,ready}'='true'
$$;
revoke all on function private.available_playground_languages() from public,anon,authenticated;
grant execute on function private.available_playground_languages() to service_role;
