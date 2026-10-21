-- Independent committed sessions exist only inside the owned disposable database.
-- The canonical lifecycle destroys that entire database after this rollback packet.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set local search_path=public,extensions;
select plan(10);
do $setup$
begin
  perform dblink_connect('profile_a',format('dbname=%L user=%L',current_database(),current_user));
  perform dblink_connect('profile_b',format('dbname=%L user=%L',current_database(),current_user));
  perform dblink_exec('profile_a',$remote$
    begin;
    set local statement_timeout='10s'; set local lock_timeout='1s';
    insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
    ('00000000-0000-4000-8000-000000013001','concurrent-admin@tuturuuu.com',now(),'{}','{}');
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
    commit;
  $remote$);
  perform dblink_exec('profile_a','begin; set local statement_timeout=''10s''; set local lock_timeout=''3s''');
  perform dblink_exec('profile_b','set statement_timeout=''10s''; set lock_timeout=''3s''');
end $setup$;
select is((select result->>'revision' from dblink('profile_a',$q$select private.update_employee_profile(
'00000000-0000-4000-8000-000000013001','00000000-0000-4000-8000-000000013002','concurrent-target@tuturuuu.com',0,
'00000000-0000-4000-8000-000000013010','Duyên Concurrent','concurrentprofile')$q$) as r(result jsonb)),'1','first session updates while transaction stays open');
select is(dblink_send_query('profile_b',$q$select private.update_employee_profile(
'00000000-0000-4000-8000-000000013001','00000000-0000-4000-8000-000000013002','concurrent-target@tuturuuu.com',0,
'00000000-0000-4000-8000-000000013011','Competing Name','concurrentprofile')$q$),1,'second real session dispatched');
do $$ begin perform pg_sleep(0.15); end $$;
select is(dblink_is_busy('profile_b'),1,'second session waits behind sorted Auth lock');
select ok(exists(select 1 from pg_locks where not granted and pid<>pg_backend_pid()),'database observes an actual lock waiter');
select dblink_exec('profile_a','commit');
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
do $$ begin perform pg_sleep(0.15); end $$;
select is(dblink_is_busy('profile_b'),1,'RESTORE waits on same sorted lock pair');
select dblink_exec('profile_a','commit');
select * from dblink_get_result('profile_b',false) as r(result jsonb);
select matches(dblink_error_message('profile_b'),'Employee restoration tuple or revision conflict','RESTORE rejects stale revision without deadlock');
select * from dblink_get_result('profile_b',false) as r(result jsonb);
select dblink_disconnect('profile_a');
select dblink_disconnect('profile_b');
select * from finish();
rollback;
