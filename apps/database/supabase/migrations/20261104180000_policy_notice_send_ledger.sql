-- Send ledger for one-shot legal/service notices (first use: the 11 Nov 2026
-- policy-change notice). Service-role only. The ledger keeps ids, statuses,
-- timestamps and the SES message id; never an address or any message content.
-- Recipients are identified by sha256(lower(trim(address))).
-- Rollback: apps/database/rollbacks/20261104180000_policy_notice_send_ledger.rollback.sql

create table if not exists private.policy_notice_runs (
    id uuid primary key default gen_random_uuid(),
    notice_id text not null check (notice_id ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
    notice_version text not null
        check (notice_version ~ '^[a-z0-9][a-z0-9.-]{2,63}$'),
    mode text not null check (mode in ('dry_run', 'test_list', 'live')),
    status text not null default 'running'
        check (status in ('running', 'completed', 'paused', 'stopped', 'failed')),
    stop_reason text check (
        stop_reason in ('bounce_rate', 'complaint_rate', 'unknown_rate', 'error')
    ),
    started_by uuid references auth.users (id) on delete set null,
    eligible integer check (eligible >= 0),
    suppressed integer check (suppressed >= 0),
    already_sent integer check (already_sent >= 0),
    sent integer check (sent >= 0),
    failed integer check (failed >= 0),
    unknown integer check (unknown >= 0),
    started_at timestamptz not null default now(),
    finished_at timestamptz
);

create index if not exists policy_notice_runs_gate_idx
    on private.policy_notice_runs (notice_id, notice_version, mode, status);

create table if not exists private.policy_notice_deliveries (
    notice_id text not null,
    notice_version text not null,
    recipient_hash text not null check (recipient_hash ~ '^[0-9a-f]{64}$'),
    run_id uuid not null references private.policy_notice_runs (id),
    mode text not null check (mode in ('test_list', 'live')),
    -- 'bounced' and 'complained' are set later from SES notifications.
    status text not null constraint policy_notice_deliveries_status_check
        check (status in (
            'pending', 'sent', 'failed', 'suppressed', 'unknown',
            'bounced', 'complained'
        )),
    suppression text check (
        suppression in ('complaint', 'hard_bounce', 'blocked', 'unsubscribed')
    ),
    ses_message_id text check (char_length(ses_message_id) between 1 and 256),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (notice_id, notice_version, recipient_hash),
    constraint policy_notice_deliveries_suppressed_check
        check ((status = 'suppressed') = (suppression is not null)),
    constraint policy_notice_deliveries_message_check
        check (
            (status in ('sent', 'bounced', 'complained'))
            = (ses_message_id is not null)
        )
);

create index if not exists policy_notice_deliveries_run_idx
    on private.policy_notice_deliveries (run_id, status);
create index if not exists policy_notice_deliveries_notice_idx
    on private.policy_notice_deliveries (notice_id, mode, status);
create index if not exists policy_notice_deliveries_message_idx
    on private.policy_notice_deliveries (ses_message_id)
    where ses_message_id is not null;

alter table private.policy_notice_runs enable row level security;
alter table private.policy_notice_deliveries enable row level security;
revoke all on table private.policy_notice_runs from public, anon, authenticated;
revoke all on table private.policy_notice_deliveries
    from public, anon, authenticated;
grant select, insert, update on table private.policy_notice_runs to service_role;
grant select, insert, update on table private.policy_notice_deliveries
    to service_role;

create or replace function private.policy_notice_recipient_hash(p_email text)
returns text
language sql
immutable
security invoker
set search_path = pg_catalog, pg_temp
as $$
    select encode(sha256(convert_to(lower(btrim(p_email)), 'UTF8')), 'hex');
$$;

revoke all on function private.policy_notice_recipient_hash(text)
    from public, anon, authenticated;
grant execute on function private.policy_notice_recipient_hash(text)
    to service_role;

-- The suppression reason for an address. Every reason suppresses: hard
-- bounces, complaints, any email_blacklist entry (do-not-email, domain blocks)
-- and the global unsubscribe ('unsubscribed'). Bounce hashes are matched in
-- both the full sha256 form and the 16-character form the email service uses
-- for abuse events.
create or replace function private.policy_notice_suppression(p_email text)
returns text
language sql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $$
    with target as (
        select
            lower(btrim(p_email)) as email,
            private.policy_notice_recipient_hash(p_email) as hash
    )
    select case
        when exists (
            select 1
            from public.email_bounce_complaints b, target t
            where b.event_type = 'complaint'
                and b.email_hash in (t.hash, left(t.hash, 16))
        ) then 'complaint'
        when exists (
            select 1
            from public.email_bounce_complaints b, target t
            where b.event_type = 'bounce'
                and b.bounce_type = 'hard'
                and b.email_hash in (t.hash, left(t.hash, 16))
        ) then 'hard_bounce'
        when exists (
            select 1
            from public.email_blacklist bl, target t
            where (
                bl.entry_type = 'domain'
                and lower(bl.value) = split_part(t.email, '@', 2)
            ) or (
                bl.entry_type = 'email'
                and lower(bl.value) = t.email
                and bl.reason is distinct from 'recipient_unsubscribed'
            )
        ) then 'blocked'
        when exists (
            select 1
            from public.email_blacklist bl, target t
            where bl.entry_type = 'email'
                and lower(bl.value) = t.email
                and bl.reason = 'recipient_unsubscribed'
        ) then 'unsubscribed'
    end;
$$;

revoke all on function private.policy_notice_suppression(text)
    from public, anon, authenticated;
grant execute on function private.policy_notice_suppression(text)
    to service_role;

-- Every confirmed, active, non-anonymous account address, flagged when it
-- owns or administers a live non-personal (business) workspace. Owners are
-- creators; administrators are MEMBERs with an enabled 'admin' permission
-- through a role or the member defaults. The notice audience is the flagged
-- addresses; the rest are counted for the record only.
create or replace function private.policy_notice_accounts()
returns table (email text, business boolean)
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
    with business_workspaces as (
        select w.id, w.creator_id
        from public.workspaces w
        where coalesce(w.deleted, false) = false and w.personal = false
    ),
    business_people as (
        select bw.creator_id as user_id
        from business_workspaces bw
        union
        select wm.user_id
        from public.workspace_members wm
        join business_workspaces bw on bw.id = wm.ws_id
        where wm.type = 'MEMBER'
            and (
                exists (
                    select 1
                    from public.workspace_role_members rm
                    join public.workspace_roles r
                        on r.id = rm.role_id and r.ws_id = wm.ws_id
                    join public.workspace_role_permissions rp
                        on rp.role_id = r.id and rp.ws_id = wm.ws_id
                    where rm.user_id = wm.user_id
                        and rp.permission = 'admin'
                        and rp.enabled
                )
                or exists (
                    select 1
                    from public.workspace_default_permissions d
                    where d.ws_id = wm.ws_id
                        and d.member_type = 'MEMBER'
                        and d.permission = 'admin'
                        and d.enabled
                )
            )
    )
    select lower(btrim(u.email)), bool_or(bp.user_id is not null)
    from auth.users u
    left join business_people bp on bp.user_id = u.id
    where u.email is not null
        and btrim(u.email) <> ''
        and u.email_confirmed_at is not null
        and u.deleted_at is null
        and coalesce(u.is_anonymous, false) = false
        and (u.banned_until is null or u.banned_until <= now())
    group by lower(btrim(u.email));
$$;

revoke all on function private.policy_notice_accounts()
    from public, anon, authenticated;
-- tuturuuu: no-grant (internal)

-- Dry run: counts only, so no address ever leaves the database.
create or replace function private.policy_notice_counts(
    p_notice_id text,
    p_notice_version text
)
returns table (
    eligible integer,
    suppressed integer,
    already_sent integer,
    previously_failed integer,
    excluded_personal_only integer
)
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
    with accounts as (
        select
            a.business,
            private.policy_notice_recipient_hash(a.email) as hash,
            case
                when a.business then private.policy_notice_suppression(a.email)
            end as suppression
        from private.policy_notice_accounts() a
    ),
    joined as (
        select a.business, a.suppression, d.status
        from accounts a
        left join private.policy_notice_deliveries d
            on d.notice_id = p_notice_id
            and d.notice_version = p_notice_version
            and d.recipient_hash = a.hash
    )
    select
        (count(*) filter (
            where business and status is null and suppression is null
        ))::integer,
        (count(*) filter (
            where business and (
                status = 'suppressed'
                or (status is null and suppression is not null)
            )
        ))::integer,
        (count(*) filter (
            where business and status in ('sent', 'bounced', 'complained')
        ))::integer,
        (count(*) filter (
            where business and status in ('pending', 'failed', 'unknown')
        ))::integer,
        (count(*) filter (where not business))::integer
    from joined;
$$;

revoke all on function private.policy_notice_counts(text, text)
    from public, anon, authenticated;
grant execute on function private.policy_notice_counts(text, text)
    to service_role;

-- The next audience addresses with no ledger row for this version. A claimed
-- row of any status is never returned again, so a run resumes where it left.
create or replace function private.policy_notice_next_recipients(
    p_notice_id text,
    p_notice_version text,
    p_limit integer
)
returns table (recipient_hash text, email text, suppression text)
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
    select a.hash, a.email, private.policy_notice_suppression(a.email)
    from (
        select
            x.email,
            private.policy_notice_recipient_hash(x.email) as hash
        from private.policy_notice_accounts() x
        where x.business
    ) a
    where not exists (
        select 1
        from private.policy_notice_deliveries d
        where d.notice_id = p_notice_id
            and d.notice_version = p_notice_version
            and d.recipient_hash = a.hash
    )
    order by a.hash
    limit least(greatest(coalesce(p_limit, 1), 1), 100);
$$;

revoke all on function private.policy_notice_next_recipients(text, text, integer)
    from public, anon, authenticated;
grant execute on function private.policy_notice_next_recipients(text, text, integer)
    to service_role;

-- Test-list classification: the same suppression rules for explicit addresses.
create or replace function private.policy_notice_classify(p_emails text[])
returns table (recipient_hash text, email text, suppression text)
language plpgsql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
    if p_emails is null or cardinality(p_emails) = 0 or cardinality(p_emails) > 10 then
        raise exception 'policy_notice_gate:invalid_test_list' using errcode = '22023';
    end if;
    return query
    select distinct on (h.hash) h.hash, h.email, private.policy_notice_suppression(h.email)
    from (
        select
            lower(btrim(e)) as email,
            private.policy_notice_recipient_hash(e) as hash
        from unnest(p_emails) as e
        where e is not null and btrim(e) <> ''
    ) h
    order by h.hash;
end;
$$;

revoke all on function private.policy_notice_classify(text[])
    from public, anon, authenticated;
grant execute on function private.policy_notice_classify(text[]) to service_role;

-- Opens a run. Real sends require, for this exact version, a completed dry
-- run (test_list and live) and a test-list delivery that was sent (live).
-- A notice goes out live in one version only.
create or replace function private.policy_notice_start_run(
    p_notice_id text,
    p_notice_version text,
    p_mode text,
    p_actor uuid
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
    v_id uuid;
begin
    if p_mode is null or p_mode not in ('dry_run', 'test_list', 'live') then
        raise exception 'policy_notice_gate:invalid_mode' using errcode = '22023';
    end if;

    -- A run that died mid-send stays unknown, never retried automatically.
    update private.policy_notice_runs
    set status = 'failed', stop_reason = 'error', finished_at = now()
    where status = 'running' and started_at < now() - interval '30 minutes';
    update private.policy_notice_deliveries d
    set status = 'unknown', updated_at = now()
    where d.status = 'pending'
        and exists (
            select 1 from private.policy_notice_runs r
            where r.id = d.run_id and r.status <> 'running'
        );

    if p_mode <> 'dry_run' and not exists (
        select 1 from private.policy_notice_runs r
        where r.notice_id = p_notice_id
            and r.notice_version = p_notice_version
            and r.mode = 'dry_run'
            and r.status = 'completed'
    ) then
        raise exception 'policy_notice_gate:dry_run_required' using errcode = 'P0001';
    end if;

    if p_mode = 'live' and not exists (
        select 1 from private.policy_notice_deliveries d
        where d.notice_id = p_notice_id
            and d.notice_version = p_notice_version
            and d.mode = 'test_list'
            and d.status = 'sent'
    ) then
        raise exception 'policy_notice_gate:test_send_required' using errcode = 'P0001';
    end if;

    if p_mode = 'live' and exists (
        select 1 from private.policy_notice_deliveries d
        where d.notice_id = p_notice_id
            and d.notice_version <> p_notice_version
            and d.mode = 'live'
            and d.status in ('pending', 'sent', 'unknown', 'bounced', 'complained')
    ) then
        raise exception 'policy_notice_gate:version_locked' using errcode = 'P0001';
    end if;

    insert into private.policy_notice_runs (
        notice_id, notice_version, mode, started_by
    )
    values (p_notice_id, p_notice_version, p_mode, p_actor)
    returning id into v_id;

    return v_id;
end;
$$;

revoke all on function private.policy_notice_start_run(text, text, text, uuid)
    from public, anon, authenticated;
grant execute on function private.policy_notice_start_run(text, text, text, uuid)
    to service_role;

create or replace function private.policy_notice_finish_run(
    p_run_id uuid,
    p_status text,
    p_stop_reason text,
    p_counts jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
    v_rows integer;
begin
    if p_status is null or p_status not in ('completed', 'paused', 'stopped', 'failed') then
        raise exception 'policy_notice_gate:invalid_status' using errcode = '22023';
    end if;

    update private.policy_notice_runs
    set status = p_status,
        stop_reason = p_stop_reason,
        finished_at = now(),
        eligible = coalesce((p_counts ->> 'eligible')::integer, eligible),
        suppressed = coalesce((p_counts ->> 'suppressed')::integer, suppressed),
        already_sent = coalesce((p_counts ->> 'already_sent')::integer, already_sent),
        sent = coalesce((p_counts ->> 'sent')::integer, sent),
        failed = coalesce((p_counts ->> 'failed')::integer, failed),
        unknown = coalesce((p_counts ->> 'unknown')::integer, unknown)
    where id = p_run_id and status = 'running';
    get diagnostics v_rows = row_count;

    update private.policy_notice_deliveries
    set status = 'unknown', updated_at = now()
    where run_id = p_run_id and status = 'pending';

    return v_rows > 0;
end;
$$;

revoke all on function private.policy_notice_finish_run(uuid, text, text, jsonb)
    from public, anon, authenticated;
grant execute on function private.policy_notice_finish_run(uuid, text, text, jsonb)
    to service_role;

-- Claims one recipient for an open send run: 'pending' before dispatch, or
-- 'suppressed' with its reason. Returns false when this version already has a
-- row for the recipient, which is what prevents any second send.
create or replace function private.policy_notice_claim(
    p_run_id uuid,
    p_recipient_hash text,
    p_suppression text
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
    v_run private.policy_notice_runs%rowtype;
    v_rows integer;
begin
    select * into v_run
    from private.policy_notice_runs
    where id = p_run_id and status = 'running' and mode <> 'dry_run';
    if not found then
        raise exception 'policy_notice_gate:run_not_open' using errcode = 'P0001';
    end if;

    insert into private.policy_notice_deliveries (
        notice_id, notice_version, recipient_hash, run_id, mode, status, suppression
    )
    values (
        v_run.notice_id,
        v_run.notice_version,
        p_recipient_hash,
        v_run.id,
        v_run.mode,
        case when p_suppression is null then 'pending' else 'suppressed' end,
        p_suppression
    )
    on conflict (notice_id, notice_version, recipient_hash) do nothing;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
end;
$$;

revoke all on function private.policy_notice_claim(uuid, text, text)
    from public, anon, authenticated;
grant execute on function private.policy_notice_claim(uuid, text, text)
    to service_role;

-- Records the outcome of a claimed send. Only a pending row of the same run
-- changes; a terminal row is never rewritten.
create or replace function private.policy_notice_record(
    p_run_id uuid,
    p_recipient_hash text,
    p_status text,
    p_suppression text,
    p_ses_message_id text
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
    v_rows integer;
begin
    if p_status is null or p_status not in ('sent', 'failed', 'unknown', 'suppressed') then
        raise exception 'policy_notice_gate:invalid_status' using errcode = '22023';
    end if;

    update private.policy_notice_deliveries
    set status = p_status,
        suppression = case when p_status = 'suppressed' then p_suppression end,
        ses_message_id = case when p_status = 'sent' then p_ses_message_id end,
        updated_at = now()
    where run_id = p_run_id
        and recipient_hash = p_recipient_hash
        and status = 'pending';
    get diagnostics v_rows = row_count;
    return v_rows > 0;
end;
$$;

revoke all on function private.policy_notice_record(uuid, text, text, text, text)
    from public, anon, authenticated;
grant execute on function private.policy_notice_record(uuid, text, text, text, text)
    to service_role;

-- Circuit-breaker inputs for one version: provider rejections and unknown
-- outcomes from the ledger, plus bounces and complaints, either set on the row
-- from SES notifications or recorded in email_bounce_complaints after send.
-- Each row counts once.
create or replace function private.policy_notice_health(
    p_notice_id text,
    p_notice_version text
)
returns table (
    attempted integer,
    rejected integer,
    unknown integer,
    hard_bounces integer,
    complaints integer
)
language sql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $$
    select
        (count(*) filter (
            where d.status in ('sent', 'failed', 'unknown', 'bounced', 'complained')
        ))::integer,
        (count(*) filter (where d.status = 'failed'))::integer,
        (count(*) filter (where d.status = 'unknown'))::integer,
        (count(*) filter (
            where d.status = 'bounced' or (d.status = 'sent' and exists (
                select 1 from public.email_bounce_complaints b
                where b.event_type = 'bounce'
                    and b.bounce_type = 'hard'
                    and b.email_hash in (d.recipient_hash, left(d.recipient_hash, 16))
                    and b.created_at >= d.created_at
            ))
        ))::integer,
        (count(*) filter (
            where d.status = 'complained' or (
                d.status in ('sent', 'bounced') and exists (
                    select 1 from public.email_bounce_complaints b
                    where b.event_type = 'complaint'
                        and b.email_hash in (d.recipient_hash, left(d.recipient_hash, 16))
                        and b.created_at >= d.created_at
                )
            )
        ))::integer
    from private.policy_notice_deliveries d
    where d.notice_id = p_notice_id and d.notice_version = p_notice_version;
$$;

revoke all on function private.policy_notice_health(text, text)
    from public, anon, authenticated;
grant execute on function private.policy_notice_health(text, text) to service_role;
