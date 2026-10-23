-- Devbox run log cursor and create idempotency (migration 20261024090000).
-- Commit-order serialization across concurrent writers needs two sessions;
-- see the delayed-insertion procedure in the remote devboxes runbook.
begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

create temp table results (name text, ok boolean);
create temp table fx as select id as actor from public.users limit 1;

insert into private.devbox_leases (id, actor_id, status)
  select 'f1111111-1111-4111-8111-111111111111', actor, 'active' from fx;
insert into private.devbox_runs (id, actor_id, lease_id, command)
  select x.id::uuid, fx.actor, 'f1111111-1111-4111-8111-111111111111', '{true}'
  from fx, (values ('f2222222-2222-4222-8222-222222222222'), ('f3333333-3333-4333-8333-333333333333')) x(id);

-- Sequences are dense per run and independent between runs.
insert into private.devbox_run_events (run_id, message)
  values ('f2222222-2222-4222-8222-222222222222', 'a'),
         ('f2222222-2222-4222-8222-222222222222', 'b'),
         ('f3333333-3333-4333-8333-333333333333', 'other');
insert into results select 'dense_per_run',
  (select array_agg(seq order by seq) = array[1, 2]::bigint[] from private.devbox_run_events
   where run_id = 'f2222222-2222-4222-8222-222222222222');
insert into results select 'independent_runs',
  (select seq = 1 from private.devbox_run_events where run_id = 'f3333333-3333-4333-8333-333333333333');

-- Writers cannot pick their own position, even an earlier one.
insert into private.devbox_run_events (run_id, message, seq)
  values ('f2222222-2222-4222-8222-222222222222', 'forged', 0);
insert into results select 'writer_cannot_choose_seq',
  (select seq = 3 from private.devbox_run_events where message = 'forged');
insert into results select 'cursor_tracks_last_seq',
  (select last_seq = 3 from private.devbox_run_event_cursors where run_id = 'f2222222-2222-4222-8222-222222222222');
insert into results select 'seq_required',
  (select attnotnull from pg_attribute where attrelid = 'private.devbox_run_events'::regclass and attname = 'seq');

-- Idempotency keys are unique per actor and well formed.
update private.devbox_runs set idempotency_key = '7d0c3a9e-1f3b-4c55-9f1e-2a3b4c5d6e7f'
  where id = 'f2222222-2222-4222-8222-222222222222';
create function pg_temp.raises(statement text) returns boolean language plpgsql as $$
begin
  execute statement;
  return false;
exception when others then
  return true;
end $$;
insert into results select 'key_unique_per_actor', pg_temp.raises(
  $sql$update private.devbox_runs set idempotency_key = '7d0c3a9e-1f3b-4c55-9f1e-2a3b4c5d6e7f'
       where id = 'f3333333-3333-4333-8333-333333333333'$sql$);
insert into results select 'key_format_checked', pg_temp.raises(
  $sql$update private.devbox_runs set idempotency_key = 'short'
       where id = 'f3333333-3333-4333-8333-333333333333'$sql$);
insert into results select 'unkeyed_runs_allowed',
  (select count(*) = 1 from private.devbox_runs
   where idempotency_key is null and id = 'f3333333-3333-4333-8333-333333333333');
insert into results select 'cursor_table_service_role_only',
  has_table_privilege('service_role', 'private.devbox_run_event_cursors', 'update')
  and not has_table_privilege('anon', 'private.devbox_run_event_cursors', 'select')
  and not has_table_privilege('authenticated', 'private.devbox_run_event_cursors', 'select');

select ok(coalesce(ok, false), name) from results order by name;

select * from finish();
rollback;
