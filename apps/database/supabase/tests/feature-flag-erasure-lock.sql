-- Lock contention for the deferred feature flag erasure: a second SQL session
-- holds the erasure lock, so the drain's erasure waits, hits the lock timeout
-- (55P03), rolls back, reports busy and leaves the intent for a retry.
\ir helpers/local-dblink.inc
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(7);

delete from private.feature_flag_erasure_intents;
insert into private.feature_flag_erasure_intents (scope, subject_id)
values ('user', '5ff20000-0000-4000-8000-000000000001');
create function pg_temp.erasure(p_id bigint) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
  r := private.feature_flag_erasure_complete(p_id);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return r;
end $$;

select dblink_connect('competitor', pg_temp.fixture_dblink_connstr());
select dblink_exec('competitor', 'begin');
select is((select x from dblink('competitor',
  $q$select (pg_advisory_xact_lock(hashtextextended('feature_flag_erasure', 0)))::text$q$) as t(x text)),
  '', 'a second session holds the erasure lock exclusively');

select is(pg_temp.erasure((select id from private.feature_flag_erasure_intents)) ->> 'status', 'busy',
  'the erasure reports busy when the lock stays contended');
select is((select last_error from private.feature_flag_erasure_intents), 'lock_not_available',
  'the intent records the lock timeout');
select is((select count(*)::int from private.feature_flag_erasure_intents), 1,
  'the contended intent stays queued');
select is(coalesce(current_setting('feature_flags.entrypoint', true), ''), '',
  'the rolled-back erasure leaves no entrypoint behind');

select dblink_exec('competitor', 'rollback');
select dblink_disconnect('competitor');

select is(pg_temp.erasure((select id from private.feature_flag_erasure_intents)) ->> 'status', 'erased',
  'the retry erases the subject once the lock is free');
select is((select count(*)::int from private.feature_flag_erasure_intents), 0,
  'the completed retry removes the intent');

select * from finish();
rollback;
