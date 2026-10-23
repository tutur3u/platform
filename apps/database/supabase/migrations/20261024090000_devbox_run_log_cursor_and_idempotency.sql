-- Devbox run log cursor and run-creation idempotency.
--
-- * Every run event gets a dense per-run sequence. It is allocated by
--   upserting the run's cursor row, whose row lock is held until the
--   inserting transaction commits. A second writer for the same run blocks
--   until the first commits, so commit order equals sequence order: a reader
--   that sees sequence N has already seen every sequence below N. Paging by a
--   created_at offset could skip an event that committed after the offset
--   advanced but carried an earlier timestamp.
-- * Runs may carry a client idempotency key, unique per actor, so a create
--   whose acknowledgement was lost is found (and can be stopped) instead of
--   being created twice or orphaned.

create table if not exists private.devbox_run_event_cursors (
    run_id uuid primary key references private.devbox_runs(id) on delete cascade,
    last_seq bigint not null default 0
);

alter table private.devbox_run_event_cursors enable row level security;

grant select, insert, update, delete on table private.devbox_run_event_cursors
    to service_role;

alter table private.devbox_run_events add column if not exists seq bigint;

create or replace function private.assign_devbox_run_event_seq()
returns trigger
language plpgsql
security definer
set search_path = private, pg_temp
as $$
begin
    -- Writers cannot choose their own position in the stream.
    insert into private.devbox_run_event_cursors as c (run_id, last_seq)
    values (new.run_id, 1)
    on conflict (run_id) do update set last_seq = c.last_seq + 1
    returning c.last_seq into new.seq;
    return new;
end;
$$;

revoke all on function private.assign_devbox_run_event_seq() from public;

-- Block concurrent event writers while existing rows are numbered, so the
-- backfill and the trigger cannot hand out the same sequence.
lock table private.devbox_run_events in share row exclusive mode;

-- Existing events keep the order readers already used (created_at, id).
with ordered as (
    select
        id,
        row_number() over (partition by run_id order by created_at, id) as seq
    from private.devbox_run_events
)
update private.devbox_run_events as e
set seq = ordered.seq
from ordered
where e.id = ordered.id
    and e.seq is null;

insert into private.devbox_run_event_cursors (run_id, last_seq)
select run_id, max(seq)
from private.devbox_run_events
group by run_id
on conflict (run_id) do update
    set last_seq = greatest(
        private.devbox_run_event_cursors.last_seq,
        excluded.last_seq
    );

drop trigger if exists assign_devbox_run_event_seq on private.devbox_run_events;
create trigger assign_devbox_run_event_seq
    before insert on private.devbox_run_events
    for each row execute function private.assign_devbox_run_event_seq();

alter table private.devbox_run_events alter column seq set not null;
-- The trigger always assigns seq; the default only keeps it optional for
-- typed inserts.
alter table private.devbox_run_events alter column seq set default 0;

create unique index if not exists devbox_run_events_run_seq_idx
    on private.devbox_run_events (run_id, seq);

alter table private.devbox_runs add column if not exists idempotency_key text;

alter table private.devbox_runs
    drop constraint if exists devbox_runs_idempotency_key_format;
alter table private.devbox_runs
    add constraint devbox_runs_idempotency_key_format check (
        idempotency_key is null
        or idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'
    );

create unique index if not exists devbox_runs_actor_idempotency_key_idx
    on private.devbox_runs (actor_id, idempotency_key)
    where idempotency_key is not null;
