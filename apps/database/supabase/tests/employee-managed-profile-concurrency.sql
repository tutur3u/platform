\ir helpers/local-dblink.inc
-- Independent committed sessions exist only inside the owned disposable database.
-- The canonical lifecycle destroys that entire database after this rollback packet.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set local search_path=public,extensions;
select plan(10);
do $setup$
begin
  perform dblink_connect('profile_a',pg_temp.fixture_dblink_connstr());
  perform dblink_connect('profile_b',pg_temp.fixture_dblink_connstr());
  perform dblink_exec('profile_a',$remote$
    begin;
    set local statement_timeout='10s'; set local lock_timeout='1s';
    insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
    ('00000000-0000-4000-8000-000000013001','concurrent-admin@tuturuuu.com',now(),'{}','{}');
    -- A confirmed address alone is not a verified staff identity.
    insert into auth.identities(provider_id,user_id,provider,identity_data)
    select id::text,id,'email',jsonb_build_object('sub',id::text,'email',email)
    from auth.users where id='00000000-0000-4000-8000-000000013001';
    insert into public.workspaces(id,name,creator_id,personal) values
    ('00000000-0000-0000-0000-000000000000','Concurrent profile fixture','00000000-0000-4000-8000-000000013001',false)
    on conflict(id) do update set creator_id=excluded.creator_id;
    insert into public.workspace_members(ws_id,user_id,type) values
    ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000013001','MEMBER')
    on conflict(ws_id,user_id) do update set type='MEMBER';
    do $seed$ begin
      perform private.employee_creation_preflight('00000000-0000-4000-8000-000000013001',
      '00000000-0000-4000-8000-000000013002','concurrent-target@tuturuuu.com','Concurrent Original');
      insert into auth.users(id,email,email_confirmed_at,banned_until,raw_app_meta_data,raw_user_meta_data) values
      ('00000000-0000-4000-8000-000000013002','concurrent-target@tuturuuu.com',now(),now()+interval '100 years','{"employee_onboarding":true}','{}');
      perform private.finalize_employee_creation('00000000-0000-4000-8000-000000013001',
      '00000000-0000-4000-8000-000000013002','concurrent-target@tuturuuu.com','Concurrent Original');
      update auth.users set banned_until=null where id='00000000-0000-4000-8000-000000013002';
      perform private.confirm_employee_activation('00000000-0000-4000-8000-000000013001',
      '00000000-0000-4000-8000-000000013002','concurrent-target@tuturuuu.com');
    end $seed$;
  $remote$);
  perform dblink_exec('profile_a','commit');
  perform dblink_exec('profile_a','begin; set local statement_timeout=''10s''; set local lock_timeout=''3s''');
  perform dblink_exec('profile_b','set statement_timeout=''10s''; set lock_timeout=''3s''');
end $setup$;
create temporary table profile_sessions as select
  (select pid from dblink('profile_a','select pg_backend_pid()') as a(pid integer)) a_pid,
  (select pid from dblink('profile_b','select pg_backend_pid()') as b(pid integer)) b_pid;
create temporary table profile_waits(phase text primary key,observed boolean not null);
create function pg_temp.profile_owned_waiter() returns boolean language sql volatile as $proof$
  select exists(
    select 1 from pg_catalog.pg_locks waiting
    join pg_catalog.pg_locks held on held.locktype='transactionid'
      and held.transactionid=waiting.transactionid and held.granted and held.mode='ExclusiveLock'
    cross join profile_sessions sessions
    where waiting.pid=sessions.b_pid and not waiting.granted
      and waiting.locktype='transactionid' and waiting.mode='ShareLock' and held.pid=sessions.a_pid
      and sessions.a_pid=any(pg_catalog.pg_blocking_pids(sessions.b_pid))
      and exists(select 1 from pg_catalog.pg_locks relation_lock
        where relation_lock.pid=sessions.b_pid and relation_lock.granted
          and relation_lock.locktype='relation' and relation_lock.relation='auth.users'::regclass
          and relation_lock.mode='RowShareLock')
      and exists(select 1 from pg_catalog.pg_locks relation_lock
        where relation_lock.pid=sessions.a_pid and relation_lock.granted
          and relation_lock.locktype='relation' and relation_lock.relation='auth.users'::regclass
          and relation_lock.mode='RowShareLock')
  );
$proof$;
create function pg_temp.await_profile_waiter() returns boolean language plpgsql as $wait$
declare deadline timestamptz:=clock_timestamp()+interval '2 seconds'; remaining double precision;
begin
  loop
    if clock_timestamp()>=deadline then return false; end if;
    if pg_temp.profile_owned_waiter() then return clock_timestamp()<deadline; end if;
    if dblink_is_busy('profile_b')<>1 then return false; end if;
    remaining:=extract(epoch from deadline-clock_timestamp());
    if remaining<=0 then return false; end if;
    perform pg_sleep(least(0.01,remaining));
  end loop;
end;
$wait$;
select is((select result->>'revision' from dblink('profile_a',$q$select private.update_employee_profile(
'00000000-0000-4000-8000-000000013001','00000000-0000-4000-8000-000000013002','concurrent-target@tuturuuu.com',0,
'00000000-0000-4000-8000-000000013010','Duyên Concurrent','concurrentprofile')$q$) as r(result jsonb)),'1','first session updates while transaction stays open');
select is(dblink_send_query('profile_b',$q$select private.update_employee_profile(
'00000000-0000-4000-8000-000000013001','00000000-0000-4000-8000-000000013002','concurrent-target@tuturuuu.com',0,
'00000000-0000-4000-8000-000000013011','Competing Name','concurrentprofile')$q$),1,'second real session dispatched');
insert into profile_waits values('rename',pg_temp.await_profile_waiter());
select is(dblink_is_busy('profile_b'),1,'second session waits behind sorted Auth lock');
select ok((select observed from profile_waits where phase='rename') and pg_temp.profile_owned_waiter(),'database observes the owned profile_b Auth transaction waiter');
do $$ begin perform dblink_exec('profile_a','commit'); end $$;
select * from dblink_get_result('profile_b',false) as r(result jsonb);
select matches(dblink_error_message('profile_b'),'Employee profile preimage conflict','second session rejects stale revision after first commits');
select * from dblink_get_result('profile_b',false) as r(result jsonb);
select is((select revision from private.infrastructure_employees where user_id='00000000-0000-4000-8000-000000013002'),1::bigint,'one committed revision');
select is((select count(*) from private.employee_profile_renames where user_id='00000000-0000-4000-8000-000000013002'),1::bigint,'one committed receipt');
select dblink_exec('profile_a','begin; set local statement_timeout=''10s''; set local lock_timeout=''3s''');
select * from dblink('profile_a',$q$select private.update_employee_profile(
'00000000-0000-4000-8000-000000013001','00000000-0000-4000-8000-000000013002','concurrent-target@tuturuuu.com',1,
'00000000-0000-4000-8000-000000013012','Duyên Concurrent','concurrentprofile')$q$) as r(result jsonb);
select ok(not (select admitted from dblink('profile_b',$q$select pg_try_advisory_xact_lock(hashtextextended('employee-address-reservations',0))$q$) as r(admitted boolean)),'shared rename admission denies exclusive address migration without waiting');
select dblink_send_query('profile_b',$q$select private.begin_employee_restore(
'00000000-0000-4000-8000-000000013001','00000000-0000-4000-8000-000000013002','concurrent-target@tuturuuu.com',1,
'00000000-0000-4000-8000-000000013020')$q$);
insert into profile_waits values('restore',pg_temp.await_profile_waiter());
select ok((select observed from profile_waits where phase='restore') and pg_temp.profile_owned_waiter() and dblink_is_busy('profile_b')=1,'RESTORE waits on the owned Auth transaction');
do $$ begin perform dblink_exec('profile_a','commit'); end $$;
select * from dblink_get_result('profile_b',false) as r(result jsonb);
select matches(dblink_error_message('profile_b'),'Employee restoration tuple or revision conflict','RESTORE rejects stale revision without deadlock');
select * from dblink_get_result('profile_b',false) as r(result jsonb);
select dblink_disconnect('profile_a');
select dblink_disconnect('profile_b');
select * from finish();
rollback;

