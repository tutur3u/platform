\ir helpers/local-dblink.inc

select plan(6);

create function pg_temp.clear_fleet_quota_fixture()
returns void language sql as $$
  delete from private.fleet_intents where requester_id = 'fa000000-0000-4000-8000-000000000003';
  delete from auth.users where id = 'fa000000-0000-4000-8000-000000000003';
  delete from public.workspaces where personal and creator_id = 'fa000000-0000-4000-8000-000000000003';
  delete from public.users where id = 'fa000000-0000-4000-8000-000000000003';
$$;

-- Two independent transactions use the real insert trigger. The direct fixture
-- inserts omit the service RPC's audit records. Cleanup leaves the revoked
-- grant and its project in place to preserve their fences between runs.
begin;
select set_config('request.jwt.claims', '{}', true);
select pg_temp.clear_fleet_quota_fixture();
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  values ('fa000000-0000-4000-8000-000000000003', 'fleet-race@example.com', now(), '{}', '{}');
insert into private.fleet_projects (key, name_en, name_vi)
  values ('fleet-quota-race', 'Quota race', 'Kiểm thử hạn mức') on conflict do nothing;
insert into private.fleet_access_grants (user_id, tier, capabilities, questions_per_hour, intents_per_day)
  values ('fa000000-0000-4000-8000-000000000003', 'observer', array['ask', 'intent.request'], 1, 1)
  on conflict (user_id) do update set auth_user_id = excluded.auth_user_id, revoked_at = null;
insert into private.fleet_access_grant_projects (user_id, project_key)
  values ('fa000000-0000-4000-8000-000000000003', 'fleet-quota-race') on conflict do nothing;
commit;

select extensions.dblink_connect('fleet_holder', pg_temp.fixture_dblink_connstr());
select extensions.dblink_connect('fleet_waiter', pg_temp.fixture_dblink_connstr());

create function pg_temp.fleet_quota_race(p_kind text)
returns table (blocked boolean, refusal text)
language plpgsql as $$
declare
  v_sql text := format($query$
    insert into private.fleet_intents (requester_id, channel, kind, payload, action_hash, project_versions)
      values ('fa000000-0000-4000-8000-000000000003', 'web', %L, '{}',
        decode(repeat('02', 32), 'hex'), '{"fleet-quota-race":1}')
      returning id
  $query$, p_kind);
  v_waiter_pid integer;
  v_holder_pid integer;
  v_deadline timestamptz;
begin
  select pid into v_waiter_pid from extensions.dblink('fleet_waiter', 'select pg_backend_pid()') as t(pid integer);
  select pid into v_holder_pid from extensions.dblink('fleet_holder', 'select pg_backend_pid()') as t(pid integer);
  perform extensions.dblink_exec('fleet_holder', 'begin');
  perform id from extensions.dblink('fleet_holder', v_sql) as t(id uuid);
  perform extensions.dblink_send_query('fleet_waiter', v_sql);
  v_deadline := clock_timestamp() + interval '5 seconds';
  loop
    blocked := v_holder_pid = any(pg_blocking_pids(v_waiter_pid));
    exit when blocked or clock_timestamp() >= v_deadline;
    perform pg_sleep(0.02);
  end loop;
  perform extensions.dblink_exec('fleet_holder', 'commit');
  perform id from extensions.dblink_get_result('fleet_waiter', false) as t(id uuid);
  refusal := split_part(extensions.dblink_error_message('fleet_waiter'), chr(10), 1);
  perform id from extensions.dblink_get_result('fleet_waiter', false) as t(id uuid);
  return next;
end;
$$;

select * from pg_temp.fleet_quota_race('status_question') \gset question_
select ok(:'question_blocked'::boolean, 'second question waits for the first transaction');
select is(:'question_refusal'::text, 'ERROR:  Fleet hourly question quota exhausted',
  'question waiter sees the committed final slot');
select is((select count(*) from private.fleet_intents
  where requester_id = 'fa000000-0000-4000-8000-000000000003' and kind = 'status_question'),
  1::bigint, 'one question is stored');

select * from pg_temp.fleet_quota_race('work.create') \gset intent_
select ok(:'intent_blocked'::boolean, 'second steer waits for the first transaction');
select is(:'intent_refusal'::text, 'ERROR:  Fleet daily intent quota exhausted',
  'steer waiter sees the committed final slot');
select is((select count(*) from private.fleet_intents
  where requester_id = 'fa000000-0000-4000-8000-000000000003' and kind = 'work.create'),
  1::bigint, 'one steer is stored');

select extensions.dblink_disconnect('fleet_holder');
select extensions.dblink_disconnect('fleet_waiter');

begin;
select pg_temp.clear_fleet_quota_fixture();
commit;

select * from finish();
