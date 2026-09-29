alter table private.learn_coding_submissions
    add column if not exists kind text not null default 'submit',
    add column if not exists language text;

alter table private.learn_coding_submissions
    add constraint learn_coding_submissions_kind_check
    check (kind in ('test', 'submit'));

alter table private.learn_coding_submissions
    add constraint learn_coding_submissions_language_check
    check (language is null or language in (
        'python', 'javascript', 'typescript', 'c', 'cpp', 'java',
        'rust', 'go', 'ruby', 'php'
    ));

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

revoke all on function private.enqueue_learn_coding_execution(
    uuid, uuid, text, text, text[], text, text
) from public, anon, authenticated;
grant execute on function private.enqueue_learn_coding_execution(
    uuid, uuid, text, text, text[], text, text
) to service_role;
