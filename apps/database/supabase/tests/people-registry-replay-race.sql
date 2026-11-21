\ir helpers/local-dblink.inc

select plan(9);

-- Committed fixtures use their own provider account and are removed at the end.
begin;
delete from private.fleet_provider_events where provider_account_id = 'people-race';
commit;

select extensions.dblink_connect('people_holder', pg_temp.fixture_dblink_connstr());
select extensions.dblink_connect('people_waiter', pg_temp.fixture_dblink_connstr());

create function pg_temp.people_event(p_fill text)
returns text language sql as $$
  select format('{"channel":"zalo","account":"people-race","eventHash":"%s"}', repeat(p_fill, 64));
$$;

-- The holder runs p_holder_sql in an open transaction; the waiter runs
-- p_waiter_sql, which must block until the holder commits.
create function pg_temp.people_race(p_holder_sql text, p_waiter_sql text)
returns table (blocked boolean, waiter_result boolean)
language plpgsql as $$
declare
  v_waiter_pid integer;
  v_holder_pid integer;
  v_deadline timestamptz;
begin
  select pid into v_waiter_pid from extensions.dblink('people_waiter', 'select pg_backend_pid()') as t(pid integer);
  select pid into v_holder_pid from extensions.dblink('people_holder', 'select pg_backend_pid()') as t(pid integer);
  perform extensions.dblink_exec('people_holder', 'begin');
  if p_holder_sql ilike 'select %' then
    perform * from extensions.dblink('people_holder', p_holder_sql) as t(r boolean);
  else
    perform extensions.dblink_exec('people_holder', p_holder_sql);
  end if;
  perform extensions.dblink_send_query('people_waiter', p_waiter_sql);
  v_deadline := clock_timestamp() + interval '5 seconds';
  loop
    blocked := v_holder_pid = any(pg_blocking_pids(v_waiter_pid));
    exit when blocked or clock_timestamp() >= v_deadline;
    perform pg_sleep(0.02);
  end loop;
  perform extensions.dblink_exec('people_holder', 'commit');
  select r into waiter_result from extensions.dblink_get_result('people_waiter') as t(r boolean);
  perform * from extensions.dblink_get_result('people_waiter', false) as t(r boolean);
  return next;
end;
$$;

select * from pg_temp.people_race(
  format('select private.fleet_consume_registry_event(%L::jsonb, %L)', pg_temp.people_event('1'), 'registry.write'),
  format('select private.fleet_consume_provider_event(%L::jsonb)', pg_temp.people_event('1'))
) \gset write_first_
select ok(:'write_first_blocked'::boolean, 'Fleet waits for a concurrent first registry write');
select ok(not :'write_first_waiter_result'::boolean, 'Fleet is refused once the registry write commits');
select is((select exclusive_slot from private.fleet_provider_events
  where provider_account_id = 'people-race' and event_hash = decode(repeat('1', 64), 'hex')),
  'registry_write', 'the first writer owns the exclusive slot');

-- A purge removes the record; redelivery after it relies on ingress freshness,
-- which refuses provider events older than the evidence window.
select private.fleet_consume_provider_event(pg_temp.people_event('2')::jsonb);
select * from pg_temp.people_race(
  format('delete from private.fleet_provider_events where provider_account_id = %L and event_hash = decode(repeat(%L, 64), %L)',
    'people-race', '2', 'hex'),
  format('select private.fleet_consume_provider_event(%L::jsonb)', pg_temp.people_event('2'))
) \gset purge_
select ok(:'purge_blocked'::boolean, 'redelivery waits for the purge transaction');
select ok(:'purge_waiter_result'::boolean, 'redelivery after a committed purge starts a new record');
select is((select attempts from private.fleet_provider_events
  where provider_account_id = 'people-race' and event_hash = decode(repeat('2', 64), 'hex')),
  1::smallint, 'the new record starts its own attempt count');

-- The row vanishes between the waiter's conflicting insert and its update: the
-- holder locks the committed row, the waiter's insert sees the conflict and its
-- update waits, then the holder deletes and commits. The waiter must retry.
select private.fleet_consume_registry_event(pg_temp.people_event('3')::jsonb, 'registry.recall');
create function pg_temp.people_vanish_race()
returns table (blocked boolean, waiter_result boolean)
language plpgsql as $$
declare
  v_waiter_pid integer;
  v_holder_pid integer;
  v_deadline timestamptz;
  v_row text := 'provider_account_id = ''people-race'' and event_hash = decode(repeat(''3'', 64), ''hex'')';
begin
  select pid into v_waiter_pid from extensions.dblink('people_waiter', 'select pg_backend_pid()') as t(pid integer);
  select pid into v_holder_pid from extensions.dblink('people_holder', 'select pg_backend_pid()') as t(pid integer);
  perform extensions.dblink_exec('people_holder', 'begin');
  perform * from extensions.dblink('people_holder',
    'select 1 from private.fleet_provider_events where ' || v_row || ' for update') as t(x integer);
  perform extensions.dblink_send_query('people_waiter',
    format('select private.fleet_consume_provider_event(%L::jsonb)', pg_temp.people_event('3')));
  v_deadline := clock_timestamp() + interval '5 seconds';
  loop
    blocked := v_holder_pid = any(pg_blocking_pids(v_waiter_pid));
    exit when blocked or clock_timestamp() >= v_deadline;
    perform pg_sleep(0.02);
  end loop;
  perform extensions.dblink_exec('people_holder', 'delete from private.fleet_provider_events where ' || v_row);
  perform extensions.dblink_exec('people_holder', 'commit');
  select r into waiter_result from extensions.dblink_get_result('people_waiter') as t(r boolean);
  perform * from extensions.dblink_get_result('people_waiter', false) as t(r boolean);
  return next;
end;
$$;
select * from pg_temp.people_vanish_race() \gset vanish_
select ok(:'vanish_blocked'::boolean, 'the waiter update waits on the locked row');
select ok(:'vanish_waiter_result'::boolean, 'the waiter retries after the row vanishes and takes a fresh record');
select is((select row(exclusive_slot, recall_consumed_at is not null, attempts)::text
  from private.fleet_provider_events
  where provider_account_id = 'people-race' and event_hash = decode(repeat('3', 64), 'hex')),
  '(fleet,f,1)', 'the retried record holds only the Fleet slot with a fresh count');

select extensions.dblink_disconnect('people_holder');
select extensions.dblink_disconnect('people_waiter');

begin;
delete from private.fleet_provider_events where provider_account_id = 'people-race';
commit;

select * from finish();
