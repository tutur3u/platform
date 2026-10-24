-- Rollback-only real-function packet; no COMMIT/transport/provider qualification.
-- Requires canonical identity/finalization/restoration and the separately frozen
-- durable journal migration in the isolated composed schema. No stubs.
begin;
set local statement_timeout='15s';
set local lock_timeout='3s';
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
('00000000-0000-4000-8000-000000094301','preflight-admin@tuturuuu.com',now(),'{}','{}'),
('00000000-0000-4000-8000-000000094302','preflight-other-admin@tuturuuu.com',now(),'{}','{}'),
('00000000-0000-4000-8000-000000094303','preflight-outsider@example.com',now(),'{}','{}'),
('00000000-0000-4000-8000-000000094304','Preflight-Auth@tuturuuu.com',now(),'{}','{}');
insert into public.workspaces(id,name,creator_id,personal) values
('00000000-0000-0000-0000-000000000000','Preflight fixture','00000000-0000-4000-8000-000000094302',false)
on conflict(id) do update set creator_id=excluded.creator_id;
insert into public.workspace_members(ws_id,user_id,type) values
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000094301','MEMBER'),
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000094302','MEMBER')
on conflict(ws_id,user_id) do update set type='MEMBER';
-- The first actor is not the creator; revoke every alternative permission path.
update public.workspace_default_permissions set enabled=false
where ws_id='00000000-0000-0000-0000-000000000000';
delete from public.workspace_role_members where user_id='00000000-0000-4000-8000-000000094301';
insert into public.workspace_default_permissions(ws_id,permission,member_type,enabled) values
('00000000-0000-0000-0000-000000000000','manage_internal_accounts','MEMBER',true)
on conflict(ws_id,permission,member_type) do update set enabled=true;

-- Only shorthand for invoking the actual function; never replaces its result.
create function pg_temp.reserve(
  actor uuid default '00000000-0000-4000-8000-000000094301',
  target uuid default '00000000-0000-4000-8000-000000094310',
  email text default 'preflight-reserved@tuturuuu.com',
  name text default 'Reserved Employee')
returns boolean language sql as $$
  select private.employee_creation_preflight(actor,target,email,name);
$$;
select is(pg_temp.reserve(),true,'absent tuple creates canonical reservation');
select is(pg_temp.reserve(target=>'00000000-0000-4000-8000-000000094311',
  email=>'preflight-second@tuturuuu.com'),true,'second disjoint reservation succeeds');
create temporary table original_intents as
select user_id,to_jsonb(i) as image,ctid::text as row_location from private.employee_creation_intents i;
select is(pg_temp.reserve(),true,'exact reservation revalidates');
select is(pg_temp.reserve(),true,'repeated reservation revalidates again');
select is((select count(*) from private.employee_creation_intents
  where user_id='00000000-0000-4000-8000-000000094310'),1::bigint,'one retained target reservation');
select ok(not exists(select 1 from auth.users where id='00000000-0000-4000-8000-000000094310'),
  'reservation did not create an Auth user');

select ok((select prosecdef from pg_proc
  where oid='private.employee_creation_preflight(uuid,uuid,text,text)'::regprocedure),'security definer retained');
select is((select proconfig from pg_proc
  where oid='private.employee_creation_preflight(uuid,uuid,text,text)'::regprocedure),
  array['search_path=pg_catalog, pg_temp']::text[],'hardened catalog search path retained');
select is((select prorettype::regtype::text from pg_proc
  where oid='private.employee_creation_preflight(uuid,uuid,text,text)'::regprocedure),'boolean','boolean contract retained');
select ok(not exists(select 1 from pg_proc p,
  lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  where p.oid='private.employee_creation_preflight(uuid,uuid,text,text)'::regprocedure
    and a.grantee=0 and a.privilege_type='EXECUTE'),'PUBLIC has no execute grant');
select ok(not has_function_privilege('anon','private.employee_creation_preflight(uuid,uuid,text,text)','EXECUTE'),
  'anon cannot execute');
select ok(not has_function_privilege('authenticated','private.employee_creation_preflight(uuid,uuid,text,text)','EXECUTE'),
  'authenticated cannot execute');
select ok(has_function_privilege('service_role','private.employee_creation_preflight(uuid,uuid,text,text)','EXECUTE'),
  'service can execute');
select ok(not has_table_privilege('service_role','private.employee_creation_intents','INSERT,UPDATE,DELETE'),
  'service cannot directly rebind intents');
set local role service_role;
select is(private.employee_creation_preflight('00000000-0000-4000-8000-000000094301',
  '00000000-0000-4000-8000-000000094310','preflight-reserved@tuturuuu.com','Reserved Employee'),
  true,'actual service-role call revalidates');
reset role;

-- Every mismatch executes the actual function and must leave all intents intact.
select throws_ok(format('select pg_temp.reserve(%L::uuid,%L::uuid,%L,%L)',actor,target,email,name),
  code,message,label)
from (values
('00000000-0000-4000-8000-000000094302','00000000-0000-4000-8000-000000094310','preflight-reserved@tuturuuu.com','Reserved Employee','23505','Employee account or reservation already exists','other authorized actor'),
('00000000-0000-4000-8000-000000094301','00000000-0000-4000-8000-000000094310','preflight-reserved@tuturuuu.com','Changed','23505','Employee account or reservation already exists','different name'),
('00000000-0000-4000-8000-000000094301','00000000-0000-4000-8000-000000094312','preflight-reserved@tuturuuu.com','Reserved Employee','23505','Employee account or reservation already exists','email-only overlap'),
('00000000-0000-4000-8000-000000094301','00000000-0000-4000-8000-000000094310','preflight-new@tuturuuu.com','Reserved Employee','23505','Employee account or reservation already exists','target-only overlap'),
('00000000-0000-4000-8000-000000094301','00000000-0000-4000-8000-000000094310','preflight-second@tuturuuu.com','Reserved Employee','23505','Employee account or reservation already exists','split overlap ascending'),
('00000000-0000-4000-8000-000000094301','00000000-0000-4000-8000-000000094311','preflight-reserved@tuturuuu.com','Reserved Employee','23505','Employee account or reservation already exists','split overlap descending'),
(null,'00000000-0000-4000-8000-000000094310','preflight-reserved@tuturuuu.com','Reserved Employee','42501','Employee administrator access denied','null actor'),
('00000000-0000-4000-8000-000000094303','00000000-0000-4000-8000-000000094310','preflight-reserved@tuturuuu.com','Reserved Employee','42501','Employee administrator access denied','outsider'),
('00000000-0000-4000-8000-000000094399','00000000-0000-4000-8000-000000094310','preflight-reserved@tuturuuu.com','Reserved Employee','42501','Employee administrator access denied','missing actor'),
('00000000-0000-4000-8000-000000094301',null,'preflight-reserved@tuturuuu.com','Reserved Employee','23502','Employee target is required','null target')
) cases(actor,target,email,name,code,message,label);
select throws_ok(format('select pg_temp.reserve(email=>%L)',email),'23514','Invalid employee email',label)
from (values (null::text,'null email'),('Preflight-reserved@tuturuuu.com','uppercase email'),
  (' preflight-reserved@tuturuuu.com','padded email'),('preflight-reserved@example.com','foreign domain'),
  ('preflight-reserved@@tuturuuu.com','malformed email'),('','empty email')) cases(email,label);
select throws_ok(format('select pg_temp.reserve(name=>%L)',name),'23514','Invalid employee name',label)
from (values ('','empty name'),(' Reserved Employee','leading whitespace'),
  ('Reserved Employee ','trailing whitespace'),(repeat('x',101),'overlong name')) cases(name,label);
select throws_ok('select pg_temp.reserve(name=>null)','23502','Employee name is required','null name');
select throws_ok($$select pg_temp.reserve(target=>'not-a-uuid')$$,'22P02',null,'malformed target UUID');
select throws_ok($$select pg_temp.reserve(actor=>'not-a-uuid')$$,'22P02',null,'malformed actor UUID');

update public.workspace_default_permissions set enabled=false
where ws_id='00000000-0000-0000-0000-000000000000';
select throws_ok('select pg_temp.reserve()','42501','Employee administrator access denied','revoked permission denies exact reservation');
update public.workspace_default_permissions set enabled=true
where ws_id='00000000-0000-0000-0000-000000000000' and permission='manage_internal_accounts' and member_type='MEMBER';
update auth.users set banned_until=now()+interval '1 day' where id='00000000-0000-4000-8000-000000094301';
select throws_ok('select pg_temp.reserve()','42501','Employee administrator access denied','banned actor denies exact reservation');
update auth.users set banned_until=null,email_confirmed_at=null where id='00000000-0000-4000-8000-000000094301';
select throws_ok('select pg_temp.reserve()','42501','Employee administrator access denied','unconfirmed actor denies exact reservation');
update auth.users set email_confirmed_at=now(),email='preflight-admin@example.com' where id='00000000-0000-4000-8000-000000094301';
select throws_ok('select pg_temp.reserve()','42501','Employee administrator access denied','noncompany actor denies exact reservation');
update auth.users set email='preflight-admin@tuturuuu.com' where id='00000000-0000-4000-8000-000000094301';
-- Use the existing service maintenance context only for fixture membership edits.
create function pg_temp.membership(member_type public.workspace_member_type)
returns void language plpgsql as $$
declare previous_role text := current_setting('request.jwt.claim.role',true);
  previous_claims text := current_setting('request.jwt.claims',true);
begin
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  update public.workspace_members set type=member_type
    where ws_id='00000000-0000-0000-0000-000000000000' and user_id='00000000-0000-4000-8000-000000094301';
  perform set_config('request.jwt.claim.role',coalesce(previous_role,''),true);
  perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
end;
$$;
select pg_temp.membership('GUEST');
select throws_ok('select pg_temp.reserve()','42501','Employee administrator access denied','root non-MEMBER denies exact reservation');
select pg_temp.membership('MEMBER');
select is(pg_temp.reserve(),true,'restored authority permits exact reservation again');

select throws_ok($$select pg_temp.reserve(target=>'00000000-0000-4000-8000-000000094304',
  email=>'preflight-unused@tuturuuu.com')$$,'23505','Employee account or reservation already exists','existing target Auth with different email');
select throws_ok($$select pg_temp.reserve(target=>'00000000-0000-4000-8000-000000094312',
  email=>'preflight-auth@tuturuuu.com')$$,'23505','Employee account or reservation already exists','Auth email comparison is lowercase');
insert into public.platform_email_roles(email,enabled) values('Preflight-reserved@tuturuuu.com',true);
select throws_ok('select pg_temp.reserve()','23505','Employee account or reservation already exists','new case-insensitive grant reservation denies exact tuple');
delete from public.platform_email_roles where email='Preflight-reserved@tuturuuu.com';
insert into private.mail_mailboxes(address,domain_id)
values('preflight-reserved@tuturuuu.com',
  (select id from private.mail_domains where domain='tuturuuu.com'));
select throws_ok('select pg_temp.reserve()','23505','Employee account or reservation already exists','new logical mailbox denies exact tuple');
delete from private.mail_mailboxes where address='preflight-reserved@tuturuuu.com';
select results_eq('select user_id,to_jsonb(i),ctid::text from private.employee_creation_intents i order by user_id',
  'select user_id,image,row_location from original_intents order by user_id',
  'all successful revalidations and denials leave every intent field and row location unchanged');

-- Real journal integration is mandatory, not skipped when migration 30000 is absent.
create temporary table claimed as select private.employee_creation_operation_claim(
  '00000000-0000-4000-8000-000000094301','00000000-0000-4000-8000-000000094320',
  'preflight-journal@tuturuuu.com','Journal Employee') value;
select is((select value->>'kind' from claimed),'claimed','real journal claim reserves target');
create temporary table attempted as select private.employee_creation_operation_advance(
  '00000000-0000-4000-8000-000000094301','00000000-0000-4000-8000-000000094320',
  (value->'operation'->>'leaseId')::uuid,0,'00000000-0000-4000-8000-000000094321','auth_attempted',null) value from claimed;
select is((select value->>'kind' from attempted),'advanced','one real attempted CAS wins');
create temporary table journal_before as select to_jsonb(o) image from private.employee_creation_operations o;
create temporary table history_before as select to_jsonb(h) image from private.employee_creation_operation_history h;
create temporary table journal_intents_before as select user_id,to_jsonb(i) image,ctid::text row_location
  from private.employee_creation_intents i;
select is(private.employee_creation_preflight('00000000-0000-4000-8000-000000094301',
  (value->'operation'->>'targetUserId')::uuid,'preflight-journal@tuturuuu.com','Journal Employee'),true,
  'actual preflight accepts journal reservation after winning attempt') from claimed;
select is(private.employee_creation_preflight('00000000-0000-4000-8000-000000094301',
  (value->'operation'->>'targetUserId')::uuid,'preflight-journal@tuturuuu.com','Journal Employee'),true,
  'repeat preflight remains only reservation validation') from claimed;
select results_eq('select to_jsonb(o) from private.employee_creation_operations o order by actor_id,operation_id',
  'select image from journal_before order by image->>''actor_id'',image->>''operation_id''',
  'preflight cannot change operation phase, version, lease, receipt or timestamps');
select results_eq('select to_jsonb(h) from private.employee_creation_operation_history h order by actor_id,operation_id,event_id',
  'select image from history_before order by image->>''actor_id'',image->>''operation_id'',image->>''event_id''',
  'preflight cannot add or alter history');
select results_eq('select user_id,to_jsonb(i),ctid::text from private.employee_creation_intents i order by user_id',
  'select user_id,image,row_location from journal_intents_before order by user_id','journal intent remains byte-for-byte unchanged');
select is(private.employee_creation_operation_advance('00000000-0000-4000-8000-000000094301',
  '00000000-0000-4000-8000-000000094320',(value->'operation'->>'leaseId')::uuid,0,
  '00000000-0000-4000-8000-000000094321','auth_attempted',null)->>'kind','inspect',
  'repeated preflight cannot mint another winning attempted transition') from claimed;
select is(private.employee_creation_operation_claim('00000000-0000-4000-8000-000000094301',
  '00000000-0000-4000-8000-000000094320','preflight-journal@tuturuuu.com','Journal Employee')->>'kind','inspect',
  'restarted claim remains inspection-only');
select throws_ok($$select private.employee_creation_operation_claim('00000000-0000-4000-8000-000000094301',
  '00000000-0000-4000-8000-000000094322','preflight-journal@tuturuuu.com','Journal Employee')$$,
  '23505',null,'different operation cannot rebind journal email');

-- Synthetic Auth row only, through the real identity triggers. No SDK call.
insert into auth.users(id,email,email_confirmed_at,banned_until,raw_app_meta_data,raw_user_meta_data)
values('00000000-0000-4000-8000-000000094310','preflight-reserved@tuturuuu.com',now(),now()+interval '1 day','{}','{}');
set constraints all immediate;
select throws_ok('select pg_temp.reserve()','23505','Employee account or reservation already exists','exact tuple cannot preflight after Auth exists');
select results_eq('select user_id,to_jsonb(i),ctid::text from private.employee_creation_intents i order by user_id',
  'select user_id,image,row_location from journal_intents_before order by user_id','post-Auth denial preserves all intents');
select * from finish();
rollback;
