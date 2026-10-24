-- Devbox run log cursor and run-creation idempotency (schema step).
--
-- Rollout is split so no step holds an exclusive lock on the run events table
-- for longer than a catalog change:
--   030000  this file: nullable columns, cursor table, triggers, functions and
--           NOT VALID constraints (metadata only, bounded by lock_timeout);
--   030100  unique (run_id, seq) index, built concurrently;
--   030150  partial index over unsequenced events, built concurrently;
--   030200  unique (actor_id, idempotency_key) index, built concurrently;
--   030300  bounded backfill of events written before this file;
--   030350  constraint validation (SHARE UPDATE EXCLUSIVE, no DML blocking).
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block, and the
-- migration runner wraps multi-statement files in one, so each concurrent
-- index is the only statement in its own file.
--
-- * Every run event gets a dense per-run sequence. It is allocated under the
--   run's cursor row lock, which is held until the inserting transaction
--   commits, so commit order equals sequence order: a reader that sees
--   sequence N has already seen every sequence below N. Events written before
--   this migration keep positions 1..n (the backfill numbers them in the
--   created_at, id order readers already used); later events start at n + 1.
-- * Runs may carry a client idempotency key, unique per actor. Writers check
--   private.devbox_run_idempotency_ready() and refuse keyed creates until the
--   unique index is valid, so a key is never stored without dedupe.

set local lock_timeout = '5s';

create table if not exists private.devbox_run_event_cursors (
    run_id uuid primary key references private.devbox_runs(id) on delete cascade,
    last_seq bigint not null default 0,
    -- Events written before the cursor migration, and how many of them the
    -- backfill has numbered. Readers page by seq only once both match.
    legacy_rows bigint not null default 0,
    legacy_numbered bigint not null default 0
);

alter table private.devbox_run_event_cursors enable row level security;

grant select, insert, update, delete on table private.devbox_run_event_cursors
    to service_role;

-- Nullable and without a default: a metadata-only change. Existing rows stay
-- NULL until the backfill numbers them.
alter table private.devbox_run_events add column if not exists seq bigint;

create or replace function private.assign_devbox_run_event_seq()
returns trigger
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare
    v_legacy bigint;
begin
    -- Writers cannot choose their own position in the stream.
    update private.devbox_run_event_cursors
    set last_seq = last_seq + 1
    where run_id = new.run_id
    returning last_seq into new.seq;
    if found then
        return new;
    end if;

    -- First append since this migration: events written before it keep
    -- positions 1..n for the backfill. That set is frozen, because every
    -- later insert fires this trigger.
    select count(*) into v_legacy
    from private.devbox_run_events
    where run_id = new.run_id and seq is null;

    insert into private.devbox_run_event_cursors as c (run_id, last_seq, legacy_rows)
    values (new.run_id, v_legacy + 1, v_legacy)
    on conflict (run_id) do update set last_seq = c.last_seq + 1
    returning c.last_seq into new.seq;
    return new;
end;
$$;

revoke all on function private.assign_devbox_run_event_seq()
    from public, anon, authenticated;

drop trigger if exists assign_devbox_run_event_seq on private.devbox_run_events;
create trigger assign_devbox_run_event_seq
    before insert on private.devbox_run_events
    for each row execute function private.assign_devbox_run_event_seq();

-- Numbers up to p_max_rows events written before this migration, oldest run
-- chunk first, and returns how many it numbered (0 when none remain). Each
-- call is bounded; the one-time job repeats it in separate transactions.
create or replace function private.backfill_devbox_run_event_seq(
    p_max_rows integer default 5000
)
returns integer
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare
    v_budget integer := greatest(1, least(coalesce(p_max_rows, 5000), 50000));
    v_total integer := 0;
    v_run uuid;
    v_numbered bigint;
    v_rows integer;
begin
    while v_total < v_budget loop
        select run_id into v_run
        from private.devbox_run_events
        where seq is null
        limit 1;
        exit when v_run is null;

        insert into private.devbox_run_event_cursors (run_id, last_seq, legacy_rows)
        select v_run, count(*), count(*)
        from private.devbox_run_events
        where run_id = v_run and seq is null
        on conflict (run_id) do nothing;

        -- Serialize with appends and other backfill calls for this run.
        select legacy_numbered into v_numbered
        from private.devbox_run_event_cursors
        where run_id = v_run
        for update;

        with chunk as (
            select id, row_number() over (order by created_at, id) as position
            from (
                select id, created_at
                from private.devbox_run_events
                where run_id = v_run and seq is null
                order by created_at, id
                limit v_budget - v_total
            ) pending
        )
        update private.devbox_run_events as e
        set seq = v_numbered + chunk.position
        from chunk
        where e.id = chunk.id;
        get diagnostics v_rows = row_count;

        update private.devbox_run_event_cursors
        set legacy_numbered = legacy_numbered + v_rows
        where run_id = v_run;

        v_total := v_total + v_rows;
        v_run := null;
        -- A concurrent call finished this run first; let the caller retry.
        exit when v_rows = 0;
    end loop;
    return v_total;
end;
$$;

revoke all on function private.backfill_devbox_run_event_seq(integer)
    from public, anon, authenticated;
grant execute on function private.backfill_devbox_run_event_seq(integer)
    to service_role;

-- New rows always get a sequence from the trigger; the backfill numbers the
-- rest before 030350 validates this.
alter table private.devbox_run_events
    drop constraint if exists devbox_run_events_seq_present;
alter table private.devbox_run_events
    add constraint devbox_run_events_seq_present check (seq is not null) not valid;

alter table private.devbox_runs add column if not exists idempotency_key text;

alter table private.devbox_runs
    drop constraint if exists devbox_runs_idempotency_key_format;
alter table private.devbox_runs
    add constraint devbox_runs_idempotency_key_format check (
        idempotency_key is null
        or idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'
    ) not valid;

-- Key storage is confirmed only once the unique index is valid (030200).
create or replace function private.devbox_run_idempotency_ready()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
    select exists (
        select 1
        from pg_index i
        join pg_class c on c.oid = i.indexrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'private'
            and c.relname = 'devbox_runs_actor_idempotency_key_idx'
            and i.indisunique
            and i.indisvalid
            and i.indisready
    );
$$;

revoke all on function private.devbox_run_idempotency_ready()
    from public, anon, authenticated;
grant execute on function private.devbox_run_idempotency_ready()
    to service_role;
