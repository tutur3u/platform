\ir helpers/local-dblink.inc

select plan(4);

begin;
select set_config('request.jwt.claims', '{}', true);
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('e3a54000-0000-4000-8000-000000009741', 'live-class-race@example.com', now(), '{}'::jsonb, '{}'::jsonb);
-- Signup creates each teacher’s personal workspace and owner membership.
insert into private.external_account_links (id, provider, external_subject, user_id)
values ('e3a54000-0000-4000-8000-000000009743', 'upskii', 'live-class-race-teacher', 'e3a54000-0000-4000-8000-000000009741');
insert into private.upskii_live_class_grants (link_id)
values ('e3a54000-0000-4000-8000-000000009743');
commit;

select extensions.dblink_connect('s4_first', pg_temp.fixture_dblink_connstr());
select extensions.dblink_connect('s4_second', pg_temp.fixture_dblink_connstr());
select extensions.dblink_exec('s4_first', 'set role service_role; set statement_timeout = ''12s''; begin');
select extensions.dblink_exec('s4_second', 'set role service_role; set statement_timeout = ''12s''');

create function pg_temp.open_s4_class()
returns text language sql as $$
  select $query$
    select public.open_upskii_live_class_room(
      's4-concurrency-fixture',
      'e3a54000-0000-4000-8000-000000009743',
      'live-class-race-teacher',
      'e3a54000-0000-4000-8000-000000009741',
      (select id from public.workspaces where personal is true and creator_id = 'e3a54000-0000-4000-8000-000000009741'),
      'S4 concurrency fixture'
    )->>'meetingId'
  $query$;
$$;

select pid from extensions.dblink('s4_first', 'select pg_backend_pid()') as result(pid integer) \gset first_
select pid from extensions.dblink('s4_second', 'select pg_backend_pid()') as result(pid integer) \gset second_
select meeting_id from extensions.dblink('s4_first', pg_temp.open_s4_class()) as result(meeting_id text) \gset first_
select is(extensions.dblink_send_query('s4_second', pg_temp.open_s4_class()), 1, 'second start runs before first commit');

create function pg_temp.await_s4_lock(holder integer, waiter integer)
returns boolean language plpgsql as $$
declare
  deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    if holder = any(pg_blocking_pids(waiter)) then return true; end if;
    if clock_timestamp() >= deadline then return false; end if;
    perform pg_sleep(0.02);
  end loop;
end;
$$;

select ok(pg_temp.await_s4_lock(:'first_pid'::integer, :'second_pid'::integer), 'second start waits on the first transaction');
select extensions.dblink_exec('s4_first', 'commit');
select meeting_id from extensions.dblink_get_result('s4_second') as result(meeting_id text) \gset second_
select is(:'second_meeting_id', :'first_meeting_id', 'both starts return the same server-issued room');
select is(
  (select count(*) from public.workspace_meetings
   where creator_id = 'e3a54000-0000-4000-8000-000000009741'),
  1::bigint, 'concurrent starts persist one meeting'
);

select extensions.dblink_disconnect('s4_second');
select extensions.dblink_disconnect('s4_first');
begin;
delete from public.workspace_meetings where creator_id = 'e3a54000-0000-4000-8000-000000009741';
delete from auth.users where id = 'e3a54000-0000-4000-8000-000000009741';
delete from public.workspaces where personal is true and creator_id = 'e3a54000-0000-4000-8000-000000009741';
delete from public.users where id = 'e3a54000-0000-4000-8000-000000009741';
commit;

select * from finish();
