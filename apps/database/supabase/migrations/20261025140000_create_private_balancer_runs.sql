-- Fleet balancer run records published by `ttr balancer` controllers.
-- A read model for Infrastructure: the controller ledger and each host's run
-- record stay authoritative; this table keeps the newest revision of each run.
create table if not exists private.balancer_runs (
    run_id text primary key
        check (run_id ~ '^[A-Za-z0-9_-]{16,128}-r[1-8]$'),
    request_id text not null
        check (request_id ~ '^[A-Za-z0-9_-]{16,128}$'),
    replica smallint not null check (replica between 1 and 8),
    revision integer not null check (revision >= 1),
    state text not null check (
        state in (
            'queued',
            'placed',
            'preparing',
            'running',
            'unknown',
            'succeeded',
            'failed',
            'cancelled',
            'setup_failed',
            'rejected'
        )
    ),
    purpose text not null,
    source_repo text not null,
    source_sha text not null check (source_sha ~ '^[0-9a-f]{40}$'),
    source_id text not null check (source_id ~ '^[0-9a-f]{64}$'),
    command text[] not null,
    cwd text not null default '',
    priority smallint not null check (priority between 0 and 9),
    requester jsonb not null default '{}'::jsonb,
    device_id text,
    lease_id uuid,
    fence integer,
    result jsonb,
    blocked_by text,
    history jsonb not null default '[]'::jsonb,
    consumed_by jsonb not null default '[]'::jsonb,
    devbox_run_id uuid references private.devbox_runs (id) on delete set null,
    queued_at timestamptz not null,
    published_by uuid not null references auth.users (id) on delete cascade,
    published_at timestamptz not null default now()
);

create index if not exists balancer_runs_request_idx
    on private.balancer_runs (request_id);
create index if not exists balancer_runs_published_idx
    on private.balancer_runs (published_at desc);

alter table private.balancer_runs enable row level security;
revoke all on table private.balancer_runs from public, anon, authenticated;
grant select, insert, update on table private.balancer_runs to service_role;

-- Newest revision wins: a delayed or replayed publication can never move a
-- run backwards, and only the original publisher may advance its runs.
create or replace function private.publish_balancer_run(
    p_publisher uuid,
    p_run jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_rows integer;
begin
    insert into private.balancer_runs as current (
        run_id,
        request_id,
        replica,
        revision,
        state,
        purpose,
        source_repo,
        source_sha,
        source_id,
        command,
        cwd,
        priority,
        requester,
        device_id,
        lease_id,
        fence,
        result,
        blocked_by,
        history,
        consumed_by,
        queued_at,
        published_by
    )
    values (
        p_run ->> 'runId',
        p_run ->> 'requestId',
        (p_run ->> 'replica')::smallint,
        (p_run ->> 'revision')::integer,
        p_run ->> 'state',
        p_run ->> 'purpose',
        p_run -> 'source' ->> 'repo',
        p_run -> 'source' ->> 'baseSha',
        p_run ->> 'sourceId',
        array(select jsonb_array_elements_text(p_run -> 'command')),
        coalesce(p_run ->> 'cwd', ''),
        (p_run ->> 'priority')::smallint,
        coalesce(p_run -> 'requester', '{}'::jsonb),
        p_run ->> 'deviceId',
        (p_run -> 'lease' ->> 'leaseId')::uuid,
        (p_run -> 'lease' ->> 'fence')::integer,
        p_run -> 'result',
        p_run ->> 'blockedBy',
        coalesce(p_run -> 'history', '[]'::jsonb),
        coalesce(p_run -> 'consumedBy', '[]'::jsonb),
        (p_run ->> 'queuedAt')::timestamptz,
        p_publisher
    )
    on conflict (run_id) do update set
        revision = excluded.revision,
        state = excluded.state,
        device_id = excluded.device_id,
        lease_id = excluded.lease_id,
        fence = excluded.fence,
        result = excluded.result,
        blocked_by = excluded.blocked_by,
        history = excluded.history,
        consumed_by = excluded.consumed_by,
        published_at = now()
    where current.revision < excluded.revision
        and current.published_by = excluded.published_by
        and current.source_id = excluded.source_id;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
end;
$$;

revoke all on function private.publish_balancer_run(uuid, jsonb)
    from public, anon, authenticated;
grant execute on function private.publish_balancer_run(uuid, jsonb)
    to service_role;
